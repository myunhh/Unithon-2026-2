-- PaperBridge normalized core schema draft
-- Target: Supabase Postgres. Review and split into ordered production migrations.
-- This file is intentionally explicit so backend agents share one domain model.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
-- Optional for P1 hybrid retrieval. Enable only after dimension/model is fixed.
create extension if not exists vector;

create type public.workspace_kind as enum ('personal', 'lab');
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.document_status as enum ('uploading', 'uploaded', 'queued', 'parsing', 'ready', 'failed', 'deleting', 'deleted');
create type public.file_kind as enum ('source_pdf', 'thumbnail', 'page_image', 'parse_artifact', 'export');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead_letter');
create type public.block_kind as enum ('paragraph', 'heading', 'figure', 'table', 'equation', 'caption', 'reference', 'header', 'footer', 'list', 'other');
create type public.annotation_kind as enum ('highlight', 'note', 'bookmark', 'ai_answer');
create type public.annotation_relocation_status as enum ('valid', 'relocated', 'orphaned', 'pending');
create type public.provider_scope as enum ('personal', 'workspace');
create type public.provider_connection_status as enum ('untested', 'valid', 'invalid', 'revoked');
create type public.agent_visibility as enum ('personal', 'workspace');
create type public.run_status as enum ('queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled');
create type public.run_operation as enum ('explain_selection', 'translate_selection', 'translate_page', 'summarize_document', 'document_chat', 'explain_figure', 'explain_table', 'explain_equation', 'critique_method');
create type public.grounding_status as enum ('pending', 'grounded', 'partial', 'unsupported_by_document', 'not_required');
create type public.run_source_role as enum ('selected', 'adjacent', 'retrieved', 'caption', 'citation');
create type public.ledger_entry_kind as enum ('reservation', 'debit', 'release', 'credit', 'adjustment');
create type public.billable_party as enum ('platform', 'byok', 'local', 'promotional');
create type public.thread_status as enum ('active', 'archived', 'deleted');
create type public.message_role as enum ('user', 'assistant', 'system', 'tool');
create type public.budget_period as enum ('calendar_month', 'rolling_30d');
create type public.enforcement_mode as enum ('warn', 'hard_stop');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');
create type public.outbox_status as enum ('pending', 'published', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(120),
  locale varchar(20) not null default 'ko-KR',
  timezone varchar(64) not null default 'Asia/Seoul',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_not_blank check (display_name is null or btrim(display_name) <> '')
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind public.workspace_kind not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name varchar(160) not null,
  slug citext,
  plan_code varchar(64) not null default 'free',
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint workspaces_name_not_blank check (btrim(name) <> ''),
  constraint workspaces_version_positive check (version > 0),
  constraint workspaces_personal_slug_null check (kind <> 'personal' or slug is null)
);

create unique index workspaces_slug_unique_active
  on public.workspaces(slug)
  where slug is not null and deleted_at is null;
create unique index workspaces_one_personal_per_owner
  on public.workspaces(owner_user_id)
  where kind = 'personal' and deleted_at is null;
create index workspaces_owner_idx on public.workspaces(owner_user_id, created_at desc);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_members_owner_active check (role <> 'owner' or status = 'active')
);

create unique index workspace_members_workspace_user_unique
  on public.workspace_members(workspace_id, user_id);
create index workspace_members_user_status_idx
  on public.workspace_members(user_id, status, workspace_id);
create index workspace_members_workspace_role_idx
  on public.workspace_members(workspace_id, status, role);

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext not null,
  role public.workspace_role not null,
  status public.invitation_status not null default 'pending',
  token_hash bytea not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_invitations_no_owner check (role <> 'owner'),
  constraint workspace_invitations_future_expiry check (expires_at > created_at)
);

create unique index workspace_invitations_pending_email_unique
  on public.workspace_invitations(workspace_id, email)
  where status = 'pending';
create unique index workspace_invitations_token_hash_unique
  on public.workspace_invitations(token_hash);

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();

create table public.document_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  original_filename varchar(500) not null,
  requested_title varchar(500),
  content_type varchar(100) not null default 'application/pdf',
  declared_byte_size bigint not null,
  declared_sha256 char(64) not null,
  bucket varchar(160) not null,
  object_key varchar(1000) not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_document_id uuid,
  idempotency_key varchar(160),
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_uploads_pdf_only check (content_type = 'application/pdf'),
  constraint document_uploads_size check (declared_byte_size between 1 and 52428800),
  constraint document_uploads_sha256 check (declared_sha256 ~ '^[a-f0-9]{64}$'),
  constraint document_uploads_expiry check (expires_at > created_at)
);

create unique index document_uploads_object_unique
  on public.document_uploads(bucket, object_key);
create unique index document_uploads_idempotency_unique
  on public.document_uploads(created_by, idempotency_key)
  where idempotency_key is not null;
create index document_uploads_expiry_idx
  on public.document_uploads(expires_at)
  where completed_at is null;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title varchar(500) not null,
  original_filename varchar(500) not null,
  mime_type varchar(100) not null default 'application/pdf',
  status public.document_status not null default 'uploaded',
  current_version_id uuid,
  current_parse_version integer,
  page_count integer,
  failure_code varchar(100),
  failure_message varchar(500),
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint documents_title_not_blank check (btrim(title) <> ''),
  constraint documents_pdf_only check (mime_type = 'application/pdf'),
  constraint documents_page_count_positive check (page_count is null or page_count > 0),
  constraint documents_version_positive check (version > 0)
);

create index documents_workspace_updated_active_idx
  on public.documents(workspace_id, updated_at desc, id desc)
  where deleted_at is null;
create index documents_status_created_idx
  on public.documents(status, created_at)
  where deleted_at is null;
create index documents_title_search_idx
  on public.documents using gin (to_tsvector('simple', title));

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_file_id uuid,
  byte_size bigint not null,
  source_sha256 char(64) not null,
  parser_version varchar(80),
  object_graph_schema_version varchar(80),
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_versions_number_positive check (version_number > 0),
  constraint document_versions_byte_size_positive check (byte_size > 0),
  constraint document_versions_sha256 check (source_sha256 ~ '^[a-f0-9]{64}$')
);

create unique index document_versions_document_number_unique
  on public.document_versions(document_id, version_number);
create unique index document_versions_document_sha_unique
  on public.document_versions(document_id, source_sha256);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id) on delete set null;

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  kind public.file_kind not null,
  storage_provider varchar(40) not null default 'supabase',
  bucket varchar(160) not null,
  object_key varchar(1000) not null,
  content_type varchar(100) not null,
  byte_size bigint not null,
  sha256 char(64),
  storage_version varchar(200),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint document_files_byte_size_positive check (byte_size > 0),
  constraint document_files_sha256_format check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);

create unique index document_files_storage_object_unique
  on public.document_files(storage_provider, bucket, object_key);
create index document_files_version_kind_idx
  on public.document_files(document_version_id, kind)
  where deleted_at is null;

alter table public.document_versions
  add constraint document_versions_source_file_fk
  foreign key (source_file_id) references public.document_files(id) on delete set null;

alter table public.document_uploads
  add constraint document_uploads_created_document_fk
  foreign key (created_document_id) references public.documents(id) on delete set null;

create table public.document_parse_jobs (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  parse_version integer not null,
  attempt integer not null default 1,
  status public.job_status not null default 'queued',
  parser_version varchar(80) not null,
  coordinate_version varchar(40) not null default 'normalized-v1',
  progress_bps integer not null default 0,
  lease_owner varchar(200),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code varchar(100),
  error_detail jsonb,
  queued_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint parse_jobs_version_positive check (parse_version > 0),
  constraint parse_jobs_attempt_positive check (attempt > 0),
  constraint parse_jobs_progress_range check (progress_bps between 0 and 10000)
);

create unique index document_parse_jobs_attempt_unique
  on public.document_parse_jobs(document_version_id, parse_version, attempt);
create index document_parse_jobs_queue_idx
  on public.document_parse_jobs(status, queued_at)
  where status in ('queued', 'running');
create index document_parse_jobs_lease_idx
  on public.document_parse_jobs(lease_expires_at)
  where status = 'running';

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  parse_version integer not null,
  page_number integer not null,
  width numeric(12,4) not null,
  height numeric(12,4) not null,
  rotation smallint not null default 0,
  text_checksum char(64),
  block_count integer not null default 0,
  textless boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_pages_number_positive check (page_number > 0),
  constraint document_pages_dimensions_positive check (width > 0 and height > 0),
  constraint document_pages_rotation check (rotation in (0, 90, 180, 270)),
  constraint document_pages_block_count_nonnegative check (block_count >= 0)
);

create unique index document_pages_unique
  on public.document_pages(document_version_id, parse_version, page_number);

create table public.document_blocks (
  id uuid primary key default gen_random_uuid(),
  document_page_id uuid not null references public.document_pages(id) on delete cascade,
  kind public.block_kind not null,
  reading_order integer not null,
  section_path text[] not null default '{}',
  text_content text not null default '',
  text_hash char(64),
  bbox_json jsonb not null,
  quads_json jsonb not null,
  caption_block_id uuid references public.document_blocks(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(text_content, ''))) stored,
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_blocks_order_nonnegative check (reading_order >= 0),
  constraint document_blocks_bbox_object check (jsonb_typeof(bbox_json) = 'object'),
  constraint document_blocks_quads_array check (jsonb_typeof(quads_json) = 'array')
);

create unique index document_blocks_page_order_unique
  on public.document_blocks(document_page_id, reading_order);
create index document_blocks_page_kind_idx
  on public.document_blocks(document_page_id, kind, reading_order);
create index document_blocks_search_idx
  on public.document_blocks using gin(search_tsv);
create index document_blocks_caption_idx
  on public.document_blocks(caption_block_id)
  where caption_block_id is not null;

create table public.document_block_embeddings (
  block_id uuid primary key references public.document_blocks(id) on delete cascade,
  embedding_model varchar(160) not null,
  embedding_version varchar(80) not null,
  embedding vector(1536) not null,
  source_text_hash char(64) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint block_embeddings_text_hash check (source_text_hash ~ '^[a-f0-9]{64}$')
);

-- Build an IVFFlat/HNSW index only after representative data and query parameters exist.

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  kind public.annotation_kind not null,
  color varchar(32),
  selected_text text,
  body_text text,
  source_run_id uuid,
  page_number integer not null,
  anchor_json jsonb not null,
  relocation_status public.annotation_relocation_status not null default 'valid',
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint annotations_page_positive check (page_number > 0),
  constraint annotations_anchor_object check (jsonb_typeof(anchor_json) = 'object'),
  constraint annotations_body_limit check (body_text is null or length(body_text) <= 20000),
  constraint annotations_version_positive check (version > 0)
);

create index annotations_document_page_idx
  on public.annotations(document_id, page_number, created_at, id)
  where deleted_at is null;
create index annotations_workspace_creator_idx
  on public.annotations(workspace_id, created_by, updated_at desc)
  where deleted_at is null;

create trigger annotations_set_updated_at
before update on public.annotations
for each row execute function public.set_updated_at();

create table public.providers (
  code varchar(80) primary key,
  display_name varchar(160) not null,
  connection_kind varchar(40) not null,
  capability_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint providers_code_format check (code ~ '^[a-z][a-z0-9_-]{1,79}$'),
  constraint providers_connection_kind check (connection_kind in ('platform', 'byok', 'desktop_local'))
);

create trigger providers_set_updated_at
before update on public.providers
for each row execute function public.set_updated_at();

create table public.provider_models (
  id uuid primary key default gen_random_uuid(),
  provider_code varchar(80) not null references public.providers(code) on delete cascade,
  model_id varchar(200) not null,
  display_name varchar(200) not null,
  capabilities text[] not null default '{}',
  context_window integer,
  input_microusd_per_million bigint,
  output_microusd_per_million bigint,
  pricing_currency char(3) not null default 'USD',
  pricing_updated_at timestamptz,
  catalog_updated_at timestamptz not null default timezone('utc', now()),
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint provider_models_context_positive check (context_window is null or context_window > 0),
  constraint provider_models_input_price_nonnegative check (input_microusd_per_million is null or input_microusd_per_million >= 0),
  constraint provider_models_output_price_nonnegative check (output_microusd_per_million is null or output_microusd_per_million >= 0)
);

create unique index provider_models_provider_model_unique
  on public.provider_models(provider_code, model_id);
create index provider_models_active_idx
  on public.provider_models(provider_code, active, display_name);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  scope public.provider_scope not null,
  provider_code varchar(80) not null references public.providers(code) on delete restrict,
  display_name varchar(160) not null,
  secret_ciphertext bytea not null,
  secret_nonce bytea not null,
  secret_tag bytea,
  secret_algorithm varchar(40) not null default 'AES-256-GCM',
  key_version integer not null,
  config_json jsonb not null default '{}'::jsonb,
  status public.provider_connection_status not null default 'untested',
  last_tested_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  constraint provider_connections_scope_owner check (
    (scope = 'personal' and owner_user_id is not null)
    or (scope = 'workspace' and owner_user_id is null)
  ),
  constraint provider_connections_key_version_positive check (key_version > 0),
  constraint provider_connections_name_not_blank check (btrim(display_name) <> '')
);

create unique index provider_connections_name_unique
  on public.provider_connections(workspace_id, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_code, display_name)
  where revoked_at is null;
create index provider_connections_workspace_status_idx
  on public.provider_connections(workspace_id, status)
  where revoked_at is null;

create trigger provider_connections_set_updated_at
before update on public.provider_connections
for each row execute function public.set_updated_at();

create table public.agent_templates (
  code varchar(80) primary key,
  name varchar(160) not null,
  purpose varchar(300) not null,
  instruction text not null,
  supported_operations public.run_operation[] not null,
  retrieval_policy_json jsonb not null default '{}'::jsonb,
  output_policy_json jsonb not null default '{}'::jsonb,
  model_policy_json jsonb not null default '{}'::jsonb,
  budget_policy_json jsonb not null default '{}'::jsonb,
  locale varchar(20) not null default 'ko-KR',
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_templates_code_format check (code ~ '^[a-z][a-z0-9_-]{1,79}$'),
  constraint agent_templates_name_not_blank check (btrim(name) <> ''),
  constraint agent_templates_instruction_not_blank check (btrim(instruction) <> ''),
  constraint agent_templates_operations_nonempty check (cardinality(supported_operations) > 0),
  constraint agent_templates_version_positive check (version > 0)
);

create trigger agent_templates_set_updated_at
before update on public.agent_templates
for each row execute function public.set_updated_at();

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name varchar(160) not null,
  purpose varchar(300) not null,
  visibility public.agent_visibility not null default 'personal',
  template_code varchar(80) references public.agent_templates(code) on delete set null,
  current_version_id uuid,
  version bigint not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint agents_name_not_blank check (btrim(name) <> ''),
  constraint agents_purpose_not_blank check (btrim(purpose) <> ''),
  constraint agents_version_positive check (version > 0)
);

create index agents_workspace_active_idx
  on public.agents(workspace_id, is_active, updated_at desc)
  where archived_at is null;
create index agents_template_idx
  on public.agents(template_code)
  where template_code is not null and is_active;

create trigger agents_set_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

create table public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  version_number integer not null,
  instruction text not null,
  supported_operations public.run_operation[] not null,
  retrieval_policy_json jsonb not null default '{}'::jsonb,
  output_policy_json jsonb not null default '{}'::jsonb,
  model_policy_json jsonb not null default '{}'::jsonb,
  budget_policy_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_versions_number_positive check (version_number > 0),
  constraint agent_versions_instruction_not_blank check (btrim(instruction) <> ''),
  constraint agent_versions_operations_nonempty check (cardinality(supported_operations) > 0)
);

create unique index agent_versions_agent_number_unique
  on public.agent_versions(agent_id, version_number);

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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint chat_threads_title_not_blank check (btrim(title) <> '')
);

create index chat_threads_document_updated_idx
  on public.chat_threads(workspace_id, document_id, updated_at desc)
  where deleted_at is null;

create trigger chat_threads_set_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  chat_thread_id uuid references public.chat_threads(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  agent_version_id uuid references public.agent_versions(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  provider_connection_id uuid references public.provider_connections(id) on delete set null,
  status public.run_status not null default 'queued',
  operation public.run_operation not null,
  provider_code varchar(80) not null,
  model_id varchar(200) not null,
  input_snapshot_json jsonb not null,
  context_manifest_json jsonb not null default '{}'::jsonb,
  output_text text,
  output_json jsonb,
  grounding_status public.grounding_status not null default 'pending',
  error_code varchar(100),
  error_message varchar(500),
  retryable boolean not null default false,
  retry_of_run_id uuid references public.agent_runs(id) on delete set null,
  max_cost_microusd bigint,
  idempotency_key varchar(160),
  request_hash char(64),
  cancellation_requested_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  constraint agent_runs_cost_nonnegative check (max_cost_microusd is null or max_cost_microusd >= 0),
  constraint agent_runs_request_hash check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$'),
  constraint agent_runs_terminal_completed_at check (
    (status in ('succeeded', 'failed', 'cancelled') and completed_at is not null)
    or (status not in ('succeeded', 'failed', 'cancelled'))
  )
);

create unique index agent_runs_idempotency_unique
  on public.agent_runs(workspace_id, requested_by, idempotency_key)
  where idempotency_key is not null;
create index agent_runs_workspace_created_idx
  on public.agent_runs(workspace_id, created_at desc, id desc);
create index agent_runs_document_created_idx
  on public.agent_runs(document_id, created_at desc, id desc);
create index agent_runs_active_idx
  on public.agent_runs(requested_by, created_at)
  where status in ('queued', 'running', 'cancelling');

create table public.agent_run_events (
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence bigint not null,
  event_id uuid not null default gen_random_uuid(),
  event_type varchar(80) not null,
  payload_json jsonb not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  primary key (run_id, sequence),
  constraint agent_run_events_sequence_positive check (sequence > 0),
  constraint agent_run_events_type_format check (event_type ~ '^run\.[a-z_]+$')
);

create unique index agent_run_events_event_id_unique
  on public.agent_run_events(event_id);
create index agent_run_events_occurred_idx
  on public.agent_run_events(occurred_at);

create table public.run_citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  block_id uuid not null references public.document_blocks(id) on delete restrict,
  source_role public.run_source_role not null,
  rank integer not null,
  score numeric(8,6),
  excerpt text,
  anchor_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint run_citations_rank_nonnegative check (rank >= 0),
  constraint run_citations_score_range check (score is null or score between 0 and 1),
  constraint run_citations_excerpt_limit check (excerpt is null or length(excerpt) <= 1000)
);

create unique index run_citations_run_block_role_unique
  on public.run_citations(run_id, block_id, source_role);
create index run_citations_run_rank_idx
  on public.run_citations(run_id, rank);

alter table public.annotations
  add constraint annotations_source_run_fk
  foreign key (source_run_id) references public.agent_runs(id) on delete set null;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role public.message_role not null,
  created_by uuid references auth.users(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  content_text text not null,
  content_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint chat_messages_content_limit check (length(content_text) <= 200000)
);

create index chat_messages_thread_created_idx
  on public.chat_messages(thread_id, created_at, id)
  where deleted_at is null;

create table public.budget_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider_code varchar(80),
  model_id varchar(200),
  agent_id uuid references public.agents(id) on delete cascade,
  period public.budget_period not null default 'calendar_month',
  limit_microusd bigint not null,
  warning_percent integer not null default 80,
  enforcement public.enforcement_mode not null default 'hard_stop',
  is_active boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint budget_policies_limit_nonnegative check (limit_microusd >= 0),
  constraint budget_policies_warning_range check (warning_percent between 1 and 100),
  constraint budget_policies_version_positive check (version > 0)
);

create index budget_policies_match_idx
  on public.budget_policies(workspace_id, user_id, provider_code, model_id, agent_id)
  where is_active;

create trigger budget_policies_set_updated_at
before update on public.budget_policies
for each row execute function public.set_updated_at();

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  run_id uuid references public.agent_runs(id) on delete set null,
  kind public.ledger_entry_kind not null,
  billable_party public.billable_party not null,
  provider_code varchar(80) not null,
  model_id varchar(200) not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  amount_microusd bigint not null,
  currency char(3) not null default 'USD',
  estimated boolean not null default false,
  provider_event_id varchar(200),
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint usage_ledger_tokens_nonnegative check (input_tokens >= 0 and output_tokens >= 0),
  constraint usage_ledger_amount_sign check (
    (kind in ('reservation', 'debit') and amount_microusd >= 0)
    or (kind in ('release', 'credit') and amount_microusd <= 0)
    or kind = 'adjustment'
  )
);

create unique index usage_ledger_provider_event_unique
  on public.usage_ledger(provider_code, provider_event_id)
  where provider_event_id is not null;
create index usage_ledger_workspace_period_idx
  on public.usage_ledger(workspace_id, occurred_at, id);
create index usage_ledger_user_period_idx
  on public.usage_ledger(user_id, occurred_at, id);
create index usage_ledger_run_idx
  on public.usage_ledger(run_id)
  where run_id is not null;

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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_seat_positive check (seat_limit is null or seat_limit > 0)
);

create unique index subscriptions_customer_unique
  on public.subscriptions(billing_provider, customer_ref);
create unique index subscriptions_subscription_unique
  on public.subscriptions(billing_provider, subscription_ref)
  where subscription_ref is not null;
create index subscriptions_workspace_status_idx
  on public.subscriptions(workspace_id, status);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.desktop_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_public_id uuid not null,
  refresh_credential_hash bytea not null,
  device_public_key bytea,
  platform varchar(40) not null default 'macos',
  architecture varchar(20) not null,
  app_version varchar(40) not null,
  update_channel varchar(40) not null default 'stable',
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint desktop_sessions_platform check (platform = 'macos'),
  constraint desktop_sessions_arch check (architecture in ('arm64', 'x64', 'universal')),
  constraint desktop_sessions_expiry check (expires_at > created_at)
);

create unique index desktop_device_sessions_installation_unique
  on public.desktop_device_sessions(installation_public_id);
create index desktop_device_sessions_user_active_idx
  on public.desktop_device_sessions(user_id, last_seen_at desc)
  where revoked_at is null;

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  method varchar(12) not null,
  route_template varchar(300) not null,
  key varchar(160) not null,
  request_hash char(64) not null,
  response_status integer,
  response_headers jsonb,
  response_body jsonb,
  resource_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint idempotency_request_hash check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint idempotency_expiry check (expires_at > created_at)
);

create unique index idempotency_keys_owner_route_key_unique
  on public.idempotency_keys(owner_user_id, method, route_template, key);
create index idempotency_keys_expiry_idx on public.idempotency_keys(expires_at);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  aggregate_type varchar(80) not null,
  aggregate_id uuid not null,
  aggregate_version bigint,
  event_type varchar(120) not null,
  payload_json jsonb not null,
  status public.outbox_status not null default 'pending',
  attempt integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  last_error_code varchar(100),
  created_at timestamptz not null default timezone('utc', now()),
  constraint outbox_attempt_nonnegative check (attempt >= 0)
);

create index outbox_events_pending_idx
  on public.outbox_events(status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create unique index outbox_events_aggregate_version_unique
  on public.outbox_events(aggregate_type, aggregate_id, aggregate_version, event_type)
  where aggregate_version is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id varchar(100),
  action varchar(120) not null,
  target_type varchar(80),
  target_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_hash bytea,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_logs_action_not_blank check (btrim(action) <> '')
);

create index audit_logs_workspace_created_idx
  on public.audit_logs(workspace_id, created_at desc, id desc);
create index audit_logs_actor_created_idx
  on public.audit_logs(actor_user_id, created_at desc, id desc);
create index audit_logs_request_idx
  on public.audit_logs(request_id)
  where request_id is not null;

comment on table public.provider_connections is 'Encrypted BYOK secrets. Never expose ciphertext, nonce, tag, or decrypted values through API DTOs.';
comment on table public.document_blocks is 'Query projection of versioned PDF object graph; canonical full graph can also live in private Storage.';
comment on table public.agent_run_events is 'Append-only replay log for SSE and desktop-compatible event normalization.';
comment on table public.usage_ledger is 'Append-only microusd ledger. Aggregates are derived, never source of truth.';
comment on column public.annotations.anchor_json is 'Must validate against selection-anchor-v1 JSON Schema in application and tests.';
comment on column public.agent_runs.context_manifest_json is 'Provider-independent IDs and hashes only; avoid duplicating full PDF text unless retention is explicitly enabled.';

commit;
