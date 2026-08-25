-- PaperBridge target baseline schema
-- Target: Supabase PostgreSQL. Review and split into ordered production migrations.
-- Assumes the Supabase-managed auth.users table exists.

begin;

create extension if not exists pgcrypto;

create type public.workspace_kind as enum ('personal', 'lab');
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.document_status as enum ('pending_upload', 'queued', 'extracting', 'structuring', 'indexing', 'ready', 'failed', 'deleting', 'deleted');
create type public.file_kind as enum ('source_pdf', 'object_graph', 'thumbnail', 'page_image', 'export');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.document_block_type as enum ('heading', 'paragraph', 'caption', 'list', 'table', 'figure', 'equation', 'reference', 'header', 'footer', 'other');
create type public.annotation_type as enum ('highlight', 'note', 'ai_answer', 'bookmark');
create type public.annotation_visibility as enum ('personal', 'workspace');
create type public.relocation_state as enum ('exact', 'relocated', 'orphaned');
create type public.provider_scope as enum ('personal', 'workspace');
create type public.connection_status as enum ('untested', 'valid', 'invalid', 'revoked', 'reconnect_required');
create type public.agent_visibility as enum ('personal', 'workspace');
create type public.run_status as enum ('queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled');
create type public.run_operation as enum ('explain_selection', 'translate_selection', 'translate_page', 'summarize_document', 'document_chat', 'explain_figure', 'explain_table', 'explain_equation', 'critique_methodology');
create type public.source_role as enum ('selected', 'adjacent', 'retrieved', 'caption', 'citation');
create type public.message_role as enum ('user', 'assistant', 'system');
create type public.thread_status as enum ('active', 'archived', 'deleted');
create type public.ledger_entry_type as enum ('reservation', 'debit', 'release', 'adjustment', 'refund');
create type public.billable_party as enum ('platform', 'byok', 'local', 'promotional');
create type public.budget_period as enum ('calendar_month', 'rolling_30d');
create type public.enforcement_mode as enum ('warn', 'hard_stop');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');
create type public.outbox_status as enum ('pending', 'publishing', 'published', 'failed');
create type public.migration_status as enum ('pending', 'running', 'succeeded', 'failed', 'skipped');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_version_and_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(120) not null,
  locale varchar(20) not null default 'ko-KR',
  timezone varchar(64) not null default 'Asia/Seoul',
  analytics_subject uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_nonempty check (length(btrim(display_name)) between 1 and 120)
);
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind public.workspace_kind not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name varchar(160) not null,
  slug varchar(100),
  plan_code varchar(64) not null default 'free',
  status varchar(32) not null default 'active',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workspaces_name_nonempty check (length(btrim(name)) between 1 and 160),
  constraint workspaces_slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,99}$'),
  constraint workspaces_status check (status in ('active', 'suspended', 'deleting', 'deleted'))
);
create unique index workspaces_slug_uq on public.workspaces(slug) where slug is not null and deleted_at is null;
create unique index workspaces_one_personal_per_owner_uq on public.workspaces(owner_user_id) where kind = 'personal' and deleted_at is null;
create index workspaces_owner_kind_idx on public.workspaces(owner_user_id, kind);
create index workspaces_status_updated_idx on public.workspaces(status, updated_at desc);
create trigger workspaces_bump_version before update on public.workspaces
for each row execute function public.bump_version_and_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  constraint workspace_members_join_state check (
    (status = 'invited' and joined_at is null)
    or (status <> 'invited')
  )
);
create index workspace_members_user_status_idx on public.workspace_members(user_id, status);
create index workspace_members_workspace_status_role_idx on public.workspace_members(workspace_id, status, role);
create trigger workspace_members_bump_version before update on public.workspace_members
for each row execute function public.bump_version_and_updated_at();

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_normalized varchar(254) not null,
  role public.workspace_role not null,
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_role check (role <> 'owner'),
  constraint workspace_invitations_email_lower check (email_normalized = lower(email_normalized))
);
create index workspace_invitations_lookup_idx on public.workspace_invitations(workspace_id, email_normalized, status);
create index workspace_invitations_expiry_idx on public.workspace_invitations(expires_at, status);
create trigger workspace_invitations_set_updated_at before update on public.workspace_invitations
for each row execute function public.set_updated_at();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title varchar(500) not null,
  original_filename varchar(500) not null,
  mime_type varchar(100) not null default 'application/pdf',
  source varchar(32) not null default 'upload',
  status public.document_status not null default 'pending_upload',
  current_version_id uuid,
  current_parse_version integer,
  page_count integer,
  highlight_count integer not null default 0,
  last_opened_at timestamptz,
  failure_code varchar(100),
  failure_message varchar(500),
  failure_retryable boolean,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_title_nonempty check (length(btrim(title)) between 1 and 500),
  constraint documents_filename_nonempty check (length(btrim(original_filename)) between 1 and 500),
  constraint documents_pdf_mime check (mime_type = 'application/pdf'),
  constraint documents_page_count check (page_count is null or page_count > 0),
  constraint documents_highlight_count check (highlight_count >= 0),
  constraint documents_parse_version check (current_parse_version is null or current_parse_version > 0)
);
create index documents_workspace_updated_idx on public.documents(workspace_id, updated_at desc, id desc) where deleted_at is null;
create index documents_workspace_status_idx on public.documents(workspace_id, status, updated_at desc) where deleted_at is null;
create index documents_creator_updated_idx on public.documents(created_by, updated_at desc) where deleted_at is null;
create trigger documents_bump_version before update on public.documents
for each row execute function public.bump_version_and_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  byte_size bigint not null,
  source_sha256 char(64) not null,
  storage_file_id uuid,
  parser_name varchar(80),
  parser_version varchar(80),
  object_graph_version varchar(40),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  constraint document_versions_number check (version_number > 0),
  constraint document_versions_size check (byte_size > 0 and byte_size <= 52428800),
  constraint document_versions_sha256 check (source_sha256 ~ '^[a-f0-9]{64}$')
);
create index document_versions_sha_idx on public.document_versions(source_sha256);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id) on delete set null;

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  kind public.file_kind not null,
  storage_provider varchar(40) not null,
  bucket varchar(160) not null,
  object_key varchar(1000) not null,
  content_type varchar(100) not null,
  content_encoding varchar(40) not null default 'identity',
  byte_size bigint not null,
  sha256 char(64),
  storage_version varchar(160),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_provider, bucket, object_key),
  constraint document_files_size check (byte_size >= 0),
  constraint document_files_sha check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint document_files_encoding check (content_encoding in ('identity', 'gzip', 'zstd'))
);
create index document_files_version_kind_idx on public.document_files(document_version_id, kind) where deleted_at is null;

alter table public.document_versions
  add constraint document_versions_storage_file_fk
  foreign key (storage_file_id) references public.document_files(id) on delete set null;

create table public.document_parse_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  parse_version integer not null,
  attempt integer not null default 1,
  status public.job_status not null default 'queued',
  reason varchar(40) not null,
  parser_name varchar(80) not null,
  parser_version varchar(80) not null,
  coordinate_version varchar(40) not null default 'normalized-v1',
  progress_bps integer not null default 0,
  lease_owner varchar(160),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code varchar(100),
  error_detail jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_version_id, parse_version, attempt),
  constraint document_parse_jobs_parse_version check (parse_version > 0),
  constraint document_parse_jobs_attempt check (attempt > 0),
  constraint document_parse_jobs_progress check (progress_bps between 0 and 10000),
  constraint document_parse_jobs_reason check (reason in ('initial', 'retry', 'reparse', 'parser_upgrade'))
);
create index document_parse_jobs_queue_idx on public.document_parse_jobs(status, queued_at) where status in ('queued', 'running');
create index document_parse_jobs_lease_idx on public.document_parse_jobs(lease_expires_at, status) where status = 'running';

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  parse_version integer not null,
  page_number integer not null,
  width numeric(12,4) not null,
  height numeric(12,4) not null,
  rotation smallint not null default 0,
  textless boolean not null default false,
  text_checksum char(64),
  block_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (document_version_id, parse_version, page_number),
  constraint document_pages_page_number check (page_number > 0),
  constraint document_pages_size check (width > 0 and height > 0),
  constraint document_pages_rotation check (rotation in (0, 90, 180, 270)),
  constraint document_pages_block_count check (block_count >= 0),
  constraint document_pages_checksum check (text_checksum is null or text_checksum ~ '^[a-f0-9]{64}$')
);

create table public.document_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.document_pages(id) on delete cascade,
  block_type public.document_block_type not null,
  reading_order integer not null,
  section_path jsonb not null default '[]'::jsonb,
  text_content text,
  text_hash char(64),
  bbox_json jsonb not null,
  quads_json jsonb not null,
  caption_block_id uuid references public.document_blocks(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(text_content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (page_id, reading_order),
  constraint document_blocks_order check (reading_order >= 0),
  constraint document_blocks_section_array check (jsonb_typeof(section_path) = 'array'),
  constraint document_blocks_bbox_object check (jsonb_typeof(bbox_json) = 'object'),
  constraint document_blocks_quads_array check (jsonb_typeof(quads_json) = 'array'),
  constraint document_blocks_metadata_object check (jsonb_typeof(metadata_json) = 'object'),
  constraint document_blocks_hash check (text_hash is null or text_hash ~ '^[a-f0-9]{64}$')
);
create index document_blocks_caption_idx on public.document_blocks(caption_block_id);
create index document_blocks_text_hash_idx on public.document_blocks(text_hash) where text_hash is not null;
create index document_blocks_search_gin on public.document_blocks using gin(search_tsv);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  annotation_type public.annotation_type not null,
  visibility public.annotation_visibility not null default 'personal',
  color_token varchar(40),
  selected_text text,
  body_text text,
  anchor_json jsonb not null,
  source_run_id uuid,
  relocation_state public.relocation_state not null default 'exact',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint annotations_anchor_object check (jsonb_typeof(anchor_json) = 'object'),
  constraint annotations_selected_text_length check (selected_text is null or length(selected_text) <= 12000),
  constraint annotations_body_text_length check (body_text is null or length(body_text) <= 50000)
);
create index annotations_document_created_idx on public.annotations(document_id, created_at desc, id desc) where deleted_at is null;
create index annotations_document_creator_idx on public.annotations(document_id, created_by, updated_at desc) where deleted_at is null;
create index annotations_workspace_visibility_idx on public.annotations(workspace_id, visibility, updated_at desc) where deleted_at is null;
create trigger annotations_bump_version before update on public.annotations
for each row execute function public.bump_version_and_updated_at();

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  scope public.provider_scope not null,
  provider_code varchar(80) not null,
  display_name varchar(160) not null,
  secret_ciphertext bytea not null,
  secret_nonce bytea not null,
  secret_tag bytea not null,
  secret_algorithm varchar(40) not null default 'AES-256-GCM',
  key_version integer not null,
  config_json jsonb not null default '{}'::jsonb,
  status public.connection_status not null default 'untested',
  last_tested_at timestamptz,
  last_error_code varchar(100),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint provider_connections_scope_owner check (
    (scope = 'personal' and owner_user_id is not null)
    or (scope = 'workspace')
  ),
  constraint provider_connections_algorithm check (secret_algorithm = 'AES-256-GCM'),
  constraint provider_connections_key_version check (key_version > 0),
  constraint provider_connections_config_object check (jsonb_typeof(config_json) = 'object')
);
create unique index provider_connections_identity_uq on public.provider_connections(workspace_id, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_code, display_name) where revoked_at is null;
create index provider_connections_workspace_status_idx on public.provider_connections(workspace_id, status) where revoked_at is null;
create trigger provider_connections_bump_version before update on public.provider_connections
for each row execute function public.bump_version_and_updated_at();

create table public.provider_model_cache (
  provider_code varchar(80) not null,
  model_id varchar(200) not null,
  display_name varchar(300) not null,
  capability_json jsonb not null default '{}'::jsonb,
  price_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  refreshed_at timestamptz not null,
  primary key (provider_code, model_id),
  constraint provider_model_cache_capability_object check (jsonb_typeof(capability_json) = 'object'),
  constraint provider_model_cache_price_object check (jsonb_typeof(price_json) = 'object')
);
create index provider_model_cache_active_idx on public.provider_model_cache(provider_code, active, refreshed_at desc);

create table public.agent_templates (
  code varchar(80) primary key,
  name_ko varchar(160) not null,
  purpose_ko varchar(500) not null,
  system_prompt text not null,
  operations_json jsonb not null,
  retrieval_policy_json jsonb not null default '{}'::jsonb,
  output_policy_json jsonb not null default '{}'::jsonb,
  model_policy_json jsonb not null default '{}'::jsonb,
  budget_policy_json jsonb not null default '{}'::jsonb,
  rollout_phase varchar(20) not null default 'p0',
  default_enabled boolean not null default true,
  template_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_templates_operations_array check (jsonb_typeof(operations_json) = 'array'),
  constraint agent_templates_policy_objects check (
    jsonb_typeof(retrieval_policy_json) = 'object'
    and jsonb_typeof(output_policy_json) = 'object'
    and jsonb_typeof(model_policy_json) = 'object'
    and jsonb_typeof(budget_policy_json) = 'object'
  )
);
create trigger agent_templates_set_updated_at before update on public.agent_templates
for each row execute function public.set_updated_at();

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name varchar(160) not null,
  purpose varchar(500) not null,
  visibility public.agent_visibility not null default 'personal',
  template_code varchar(80) references public.agent_templates(code) on delete set null,
  current_version_id uuid,
  active boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint agents_name_nonempty check (length(btrim(name)) between 1 and 160),
  constraint agents_purpose_nonempty check (length(btrim(purpose)) between 1 and 500)
);
create index agents_workspace_active_idx on public.agents(workspace_id, active, updated_at desc);
create index agents_workspace_template_idx on public.agents(workspace_id, template_code);
create trigger agents_bump_version before update on public.agents
for each row execute function public.bump_version_and_updated_at();

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  version_number integer not null,
  system_prompt text not null,
  operations_json jsonb not null,
  retrieval_policy_json jsonb not null default '{}'::jsonb,
  output_policy_json jsonb not null default '{}'::jsonb,
  model_policy_json jsonb not null default '{}'::jsonb,
  budget_policy_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (agent_id, version_number),
  constraint agent_versions_number check (version_number > 0),
  constraint agent_versions_operations_array check (jsonb_typeof(operations_json) = 'array'),
  constraint agent_versions_policy_objects check (
    jsonb_typeof(retrieval_policy_json) = 'object'
    and jsonb_typeof(output_policy_json) = 'object'
    and jsonb_typeof(model_policy_json) = 'object'
    and jsonb_typeof(budget_policy_json) = 'object'
  )
);

alter table public.agents
  add constraint agents_current_version_fk
  foreign key (current_version_id) references public.agent_versions(id) on delete set null;

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title varchar(300) not null,
  status public.thread_status not null default 'active',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_threads_title_nonempty check (length(btrim(title)) between 1 and 300)
);
create index chat_threads_workspace_document_idx on public.chat_threads(workspace_id, document_id, updated_at desc) where status <> 'deleted';
create trigger chat_threads_bump_version before update on public.chat_threads
for each row execute function public.bump_version_and_updated_at();

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  thread_id uuid references public.chat_threads(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  agent_version_id uuid references public.agent_versions(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  provider_connection_id uuid references public.provider_connections(id) on delete set null,
  status public.run_status not null default 'queued',
  operation public.run_operation not null,
  scope varchar(32) not null,
  provider_code varchar(80) not null,
  model_id varchar(200) not null,
  request_json jsonb not null,
  result_text text,
  result_json jsonb,
  evidence_status varchar(40),
  error_code varchar(100),
  error_message varchar(500),
  retry_of_run_id uuid references public.agent_runs(id) on delete set null,
  input_tokens integer,
  output_tokens integer,
  cost_microusd bigint,
  currency char(3) not null default 'USD',
  usage_estimated boolean not null default false,
  idempotency_key varchar(160),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint agent_runs_scope check (scope in ('selection', 'page', 'section', 'document')),
  constraint agent_runs_request_object check (jsonb_typeof(request_json) = 'object'),
  constraint agent_runs_result_object check (result_json is null or jsonb_typeof(result_json) = 'object'),
  constraint agent_runs_tokens check ((input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0)),
  constraint agent_runs_cost check (cost_microusd is null or cost_microusd >= 0),
  constraint agent_runs_currency check (currency = 'USD'),
  constraint agent_runs_evidence check (evidence_status is null or evidence_status in ('supported', 'partially_supported', 'unsupported_by_document', 'not_required'))
);
create unique index agent_runs_idempotency_uq on public.agent_runs(workspace_id, requested_by, idempotency_key) where idempotency_key is not null;
create index agent_runs_workspace_created_idx on public.agent_runs(workspace_id, created_at desc, id desc);
create index agent_runs_document_created_idx on public.agent_runs(document_id, created_at desc, id desc);
create index agent_runs_active_idx on public.agent_runs(status, created_at) where status in ('queued', 'running', 'cancelling');

alter table public.annotations
  add constraint annotations_source_run_fk
  foreign key (source_run_id) references public.agent_runs(id) on delete set null;

create table public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence bigint not null,
  event_type varchar(80) not null,
  payload_json jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (run_id, sequence),
  constraint agent_run_events_sequence check (sequence > 0),
  constraint agent_run_events_payload_object check (jsonb_typeof(payload_json) = 'object')
);
create index agent_run_events_run_created_idx on public.agent_run_events(run_id, created_at);

create table public.run_citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  block_id uuid not null references public.document_blocks(id) on delete restrict,
  source_role public.source_role not null,
  rank integer not null,
  score numeric(8,6),
  excerpt text,
  anchor_json jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, block_id, source_role),
  constraint run_citations_rank check (rank >= 0),
  constraint run_citations_score check (score is null or (score >= 0 and score <= 1)),
  constraint run_citations_anchor_object check (anchor_json is null or jsonb_typeof(anchor_json) = 'object'),
  constraint run_citations_excerpt_length check (excerpt is null or length(excerpt) <= 1000)
);
create index run_citations_run_rank_idx on public.run_citations(run_id, rank);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role public.message_role not null,
  created_by uuid references auth.users(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  content_text text not null,
  content_json jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_content_nonempty check (length(content_text) > 0),
  constraint chat_messages_content_object check (content_json is null or jsonb_typeof(content_json) = 'object')
);
create index chat_messages_thread_created_idx on public.chat_messages(thread_id, created_at, id);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  run_id uuid references public.agent_runs(id) on delete set null,
  entry_type public.ledger_entry_type not null,
  provider_code varchar(80) not null,
  model_id varchar(200) not null,
  billable_party public.billable_party not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  amount_microusd bigint not null,
  currency char(3) not null default 'USD',
  estimated boolean not null default false,
  provider_event_id varchar(200),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint usage_ledger_tokens check (input_tokens >= 0 and output_tokens >= 0),
  constraint usage_ledger_currency check (currency = 'USD')
);
create index usage_ledger_workspace_time_idx on public.usage_ledger(workspace_id, occurred_at desc);
create index usage_ledger_user_time_idx on public.usage_ledger(user_id, occurred_at desc);
create index usage_ledger_run_type_idx on public.usage_ledger(run_id, entry_type) where run_id is not null;
create unique index usage_ledger_provider_event_uq on public.usage_ledger(provider_code, provider_event_id) where provider_event_id is not null;

create table public.budget_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider_code varchar(80),
  model_id varchar(200),
  period public.budget_period not null default 'calendar_month',
  limit_microusd bigint not null,
  warning_percent integer not null default 80,
  enforcement public.enforcement_mode not null default 'hard_stop',
  active boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_policies_limit check (limit_microusd >= 0),
  constraint budget_policies_warning check (warning_percent between 1 and 100)
);
create index budget_policies_lookup_idx on public.budget_policies(workspace_id, user_id, provider_code, model_id, active);
create trigger budget_policies_bump_version before update on public.budget_policies
for each row execute function public.bump_version_and_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  billing_provider varchar(40) not null,
  customer_ref varchar(200) not null,
  subscription_ref varchar(200),
  plan_code varchar(64) not null,
  status public.subscription_status not null,
  seat_limit integer,
  entitlement_json jsonb not null default '{}'::jsonb,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_seat_limit check (seat_limit is null or seat_limit > 0),
  constraint subscriptions_entitlement_object check (jsonb_typeof(entitlement_json) = 'object')
);
create unique index subscriptions_customer_uq on public.subscriptions(billing_provider, customer_ref);
create unique index subscriptions_ref_uq on public.subscriptions(billing_provider, subscription_ref) where subscription_ref is not null;
create index subscriptions_workspace_status_idx on public.subscriptions(workspace_id, status);
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_public_id uuid not null unique,
  credential_hash bytea not null unique,
  device_public_key bytea,
  platform varchar(40) not null default 'macos',
  architecture varchar(20) not null,
  app_version varchar(40) not null,
  update_channel varchar(40) not null default 'stable',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint device_sessions_platform check (platform = 'macos'),
  constraint device_sessions_architecture check (architecture in ('arm64', 'x64')),
  constraint device_sessions_channel check (update_channel in ('alpha', 'beta', 'stable'))
);
create index device_sessions_user_active_idx on public.device_sessions(user_id, revoked_at, last_seen_at desc);

create table public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope varchar(80) not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key varchar(160) not null,
  request_hash char(64) not null,
  response_status integer,
  response_json jsonb,
  resource_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (scope, actor_user_id, idempotency_key),
  constraint idempotency_records_request_hash check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint idempotency_records_response_object check (response_json is null or jsonb_typeof(response_json) = 'object')
);
create index idempotency_records_expiry_idx on public.idempotency_records(expires_at);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  aggregate_type varchar(80) not null,
  aggregate_id uuid not null,
  event_type varchar(120) not null,
  payload_json jsonb not null,
  status public.outbox_status not null default 'pending',
  attempt integer not null default 0,
  available_at timestamptz not null default now(),
  locked_by varchar(160),
  locked_at timestamptz,
  published_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz not null default now(),
  constraint outbox_events_payload_object check (jsonb_typeof(payload_json) = 'object'),
  constraint outbox_events_attempt check (attempt >= 0)
);
create index outbox_events_pending_idx on public.outbox_events(status, available_at, created_at) where status in ('pending', 'failed');
create index outbox_events_aggregate_idx on public.outbox_events(aggregate_type, aggregate_id, created_at);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id varchar(100),
  action varchar(120) not null,
  target_type varchar(80),
  target_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_hash bytea,
  created_at timestamptz not null default now(),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata_json) = 'object')
);
create index audit_logs_workspace_time_idx on public.audit_logs(workspace_id, created_at desc, id desc);
create index audit_logs_actor_time_idx on public.audit_logs(actor_user_id, created_at desc, id desc) where actor_user_id is not null;
create index audit_logs_request_idx on public.audit_logs(request_id) where request_id is not null;

create table public.migration_registry (
  id uuid primary key default gen_random_uuid(),
  migration_name varchar(120) not null,
  source_type varchar(80) not null,
  source_key varchar(1000) not null,
  source_checksum char(64),
  target_json jsonb not null default '{}'::jsonb,
  status public.migration_status not null default 'pending',
  attempt integer not null default 0,
  error_code varchar(100),
  error_detail jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (migration_name, source_type, source_key),
  constraint migration_registry_checksum check (source_checksum is null or source_checksum ~ '^[a-f0-9]{64}$'),
  constraint migration_registry_target_object check (jsonb_typeof(target_json) = 'object'),
  constraint migration_registry_attempt check (attempt >= 0)
);
create index migration_registry_status_idx on public.migration_registry(migration_name, status, updated_at);
create trigger migration_registry_set_updated_at before update on public.migration_registry
for each row execute function public.set_updated_at();

commit;
