-- PaperBridge RLS and privilege draft
-- Assumption: Browser/renderer never talks directly to Postgres for product data.
-- Backend API uses a request-scoped user JWT/RLS client where practical and a tightly
-- wrapped service-role client for worker/secret operations. Review all policies with pgTAP.

begin;

create or replace function public.current_workspace_role(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = auth.uid()
    and wm.status = 'active'
  limit 1
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_workspace_role(target_workspace_id) is not null
$$;

create or replace function public.has_workspace_role(
  target_workspace_id uuid,
  minimum_role public.workspace_role
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case public.current_workspace_role(target_workspace_id)
    when 'owner' then 4
    when 'admin' then 3
    when 'member' then 2
    when 'viewer' then 1
    else 0
  end >= case minimum_role
    when 'owner' then 4
    when 'admin' then 3
    when 'member' then 2
    when 'viewer' then 1
  end
$$;

create or replace function public.document_workspace_id(target_document_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.workspace_id
  from public.documents d
  where d.id = target_document_id
    and d.deleted_at is null
$$;

create or replace function public.document_version_workspace_id(target_version_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.workspace_id
  from public.document_versions dv
  join public.documents d on d.id = dv.document_id
  where dv.id = target_version_id
    and d.deleted_at is null
$$;

create or replace function public.document_page_workspace_id(target_page_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.workspace_id
  from public.document_pages p
  join public.document_versions dv on dv.id = p.document_version_id
  join public.documents d on d.id = dv.document_id
  where p.id = target_page_id
    and d.deleted_at is null
$$;

create or replace function public.agent_workspace_id(target_agent_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.workspace_id
  from public.agents a
  where a.id = target_agent_id
    and a.archived_at is null
$$;

revoke all on function public.current_workspace_role(uuid) from public;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, public.workspace_role) from public;
revoke all on function public.document_workspace_id(uuid) from public;
revoke all on function public.document_version_workspace_id(uuid) from public;
revoke all on function public.document_page_workspace_id(uuid) from public;
revoke all on function public.agent_workspace_id(uuid) from public;

grant execute on function public.current_workspace_role(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, public.workspace_role) to authenticated, service_role;
grant execute on function public.document_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.document_version_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.document_page_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.agent_workspace_id(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.document_uploads enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_files enable row level security;
alter table public.document_parse_jobs enable row level security;
alter table public.document_pages enable row level security;
alter table public.document_blocks enable row level security;
alter table public.document_block_embeddings enable row level security;
alter table public.annotations enable row level security;
alter table public.providers enable row level security;
alter table public.provider_models enable row level security;
alter table public.provider_connections enable row level security;
alter table public.agent_templates enable row level security;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_events enable row level security;
alter table public.run_citations enable row level security;
alter table public.budget_policies enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.subscriptions enable row level security;
alter table public.desktop_device_sessions enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles
for select to authenticated
using (user_id = auth.uid());

create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (user_id = auth.uid());

create policy profiles_update_own on public.profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Workspaces
create policy workspaces_select_member on public.workspaces
for select to authenticated
using (deleted_at is null and public.is_workspace_member(id));

create policy workspaces_insert_owner on public.workspaces
for insert to authenticated
with check (owner_user_id = auth.uid());

create policy workspaces_update_admin on public.workspaces
for update to authenticated
using (deleted_at is null and public.has_workspace_role(id, 'admin'))
with check (public.has_workspace_role(id, 'admin'));

create policy workspaces_delete_owner on public.workspaces
for delete to authenticated
using (public.has_workspace_role(id, 'owner'));

-- Memberships. Service layer must additionally prevent removing/demoting the last owner.
create policy workspace_members_select_member on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert_admin on public.workspace_members
for insert to authenticated
with check (public.has_workspace_role(workspace_id, 'admin'));

create policy workspace_members_update_admin on public.workspace_members
for update to authenticated
using (public.has_workspace_role(workspace_id, 'admin'))
with check (public.has_workspace_role(workspace_id, 'admin'));

create policy workspace_members_delete_admin on public.workspace_members
for delete to authenticated
using (public.has_workspace_role(workspace_id, 'admin'));

create policy workspace_invitations_select_admin_or_invitee on public.workspace_invitations
for select to authenticated
using (
  public.has_workspace_role(workspace_id, 'admin')
  or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy workspace_invitations_write_admin on public.workspace_invitations
for all to authenticated
using (public.has_workspace_role(workspace_id, 'admin'))
with check (public.has_workspace_role(workspace_id, 'admin'));

-- Uploads/documents
create policy document_uploads_select_member on public.document_uploads
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy document_uploads_insert_member on public.document_uploads
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
);

create policy documents_select_member on public.documents
for select to authenticated
using (deleted_at is null and public.is_workspace_member(workspace_id));

create policy documents_insert_member on public.documents
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
);

create policy documents_update_member on public.documents
for update to authenticated
using (deleted_at is null and public.has_workspace_role(workspace_id, 'member'))
with check (public.has_workspace_role(workspace_id, 'member'));

create policy documents_delete_member on public.documents
for delete to authenticated
using (public.has_workspace_role(workspace_id, 'member'));

create policy document_versions_select_member on public.document_versions
for select to authenticated
using (public.is_workspace_member(public.document_version_workspace_id(id)));

create policy document_files_select_member on public.document_files
for select to authenticated
using (public.is_workspace_member(public.document_version_workspace_id(document_version_id)));

create policy document_parse_jobs_select_member on public.document_parse_jobs
for select to authenticated
using (public.is_workspace_member(public.document_version_workspace_id(document_version_id)));

create policy document_pages_select_member on public.document_pages
for select to authenticated
using (public.is_workspace_member(public.document_version_workspace_id(document_version_id)));

create policy document_blocks_select_member on public.document_blocks
for select to authenticated
using (public.is_workspace_member(public.document_page_workspace_id(document_page_id)));

create policy document_block_embeddings_select_member on public.document_block_embeddings
for select to authenticated
using (
  exists (
    select 1
    from public.document_blocks b
    where b.id = block_id
      and public.is_workspace_member(public.document_page_workspace_id(b.document_page_id))
  )
);

-- Annotations
create policy annotations_select_member on public.annotations
for select to authenticated
using (deleted_at is null and public.is_workspace_member(workspace_id));

create policy annotations_insert_member on public.annotations
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
  and workspace_id = public.document_workspace_id(document_id)
);

create policy annotations_update_creator_or_admin on public.annotations
for update to authenticated
using (
  deleted_at is null
  and (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'))
)
with check (
  created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin')
);

create policy annotations_delete_creator_or_admin on public.annotations
for delete to authenticated
using (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'));

-- Public provider catalog is authenticated read-only.
create policy providers_select_authenticated on public.providers
for select to authenticated
using (active);

create policy provider_models_select_authenticated on public.provider_models
for select to authenticated
using (active);

-- BYOK connection rows contain ciphertext and are API-only. RLS is defense in depth.
create policy provider_connections_select_owner_or_admin on public.provider_connections
for select to authenticated
using (
  revoked_at is null
  and (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (scope = 'workspace' and public.has_workspace_role(workspace_id, 'admin'))
  )
);

create policy provider_connections_insert_owner_or_admin on public.provider_connections
for insert to authenticated
with check (
  (scope = 'personal' and owner_user_id = auth.uid() and public.is_workspace_member(workspace_id))
  or (scope = 'workspace' and owner_user_id is null and public.has_workspace_role(workspace_id, 'admin'))
);

create policy provider_connections_update_owner_or_admin on public.provider_connections
for update to authenticated
using (
  (scope = 'personal' and owner_user_id = auth.uid())
  or (scope = 'workspace' and public.has_workspace_role(workspace_id, 'admin'))
)
with check (
  (scope = 'personal' and owner_user_id = auth.uid())
  or (scope = 'workspace' and public.has_workspace_role(workspace_id, 'admin'))
);

create policy provider_connections_delete_owner_or_admin on public.provider_connections
for delete to authenticated
using (
  (scope = 'personal' and owner_user_id = auth.uid())
  or (scope = 'workspace' and public.has_workspace_role(workspace_id, 'admin'))
);

create policy agent_templates_select_authenticated on public.agent_templates
for select to authenticated
using (active);

-- Agents and versions
create policy agents_select_member on public.agents
for select to authenticated
using (
  archived_at is null
  and public.is_workspace_member(workspace_id)
  and (visibility = 'workspace' or created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'))
);

create policy agents_insert_member on public.agents
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
  and (visibility = 'personal' or public.has_workspace_role(workspace_id, 'admin'))
);

create policy agents_update_creator_or_admin on public.agents
for update to authenticated
using (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'))
with check (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'));

create policy agents_delete_creator_or_admin on public.agents
for delete to authenticated
using (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'));

create policy agent_versions_select_member on public.agent_versions
for select to authenticated
using (public.is_workspace_member(public.agent_workspace_id(agent_id)));

create policy agent_versions_insert_creator_or_admin on public.agent_versions
for insert to authenticated
with check (
  exists (
    select 1 from public.agents a
    where a.id = agent_id
      and (a.created_by = auth.uid() or public.has_workspace_role(a.workspace_id, 'admin'))
  )
);

-- Chat
create policy chat_threads_select_member on public.chat_threads
for select to authenticated
using (deleted_at is null and public.is_workspace_member(workspace_id));

create policy chat_threads_insert_member on public.chat_threads
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
  and workspace_id = public.document_workspace_id(document_id)
);

create policy chat_threads_update_creator_or_admin on public.chat_threads
for update to authenticated
using (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'))
with check (created_by = auth.uid() or public.has_workspace_role(workspace_id, 'admin'));

create policy chat_messages_select_member on public.chat_messages
for select to authenticated
using (
  exists (
    select 1 from public.chat_threads t
    where t.id = thread_id
      and t.deleted_at is null
      and public.is_workspace_member(t.workspace_id)
  )
);

create policy chat_messages_insert_member on public.chat_messages
for insert to authenticated
with check (
  (created_by is null or created_by = auth.uid())
  and exists (
    select 1 from public.chat_threads t
    where t.id = thread_id
      and t.deleted_at is null
      and public.has_workspace_role(t.workspace_id, 'member')
  )
);

-- Runs/citations/events. Direct writes remain service-role only.
create policy agent_runs_select_member on public.agent_runs
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy agent_runs_insert_requester on public.agent_runs
for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.has_workspace_role(workspace_id, 'member')
  and workspace_id = public.document_workspace_id(document_id)
);

create policy agent_run_events_select_member on public.agent_run_events
for select to authenticated
using (
  exists (
    select 1 from public.agent_runs r
    where r.id = run_id and public.is_workspace_member(r.workspace_id)
  )
);

create policy run_citations_select_member on public.run_citations
for select to authenticated
using (
  exists (
    select 1 from public.agent_runs r
    where r.id = run_id and public.is_workspace_member(r.workspace_id)
  )
);

-- Budgets/usage/subscription
create policy budget_policies_select_member on public.budget_policies
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy budget_policies_write_admin on public.budget_policies
for all to authenticated
using (public.has_workspace_role(workspace_id, 'admin'))
with check (public.has_workspace_role(workspace_id, 'admin'));

create policy usage_ledger_select_member on public.usage_ledger
for select to authenticated
using (
  public.has_workspace_role(workspace_id, 'admin')
  or user_id = auth.uid()
);

create policy subscriptions_select_admin on public.subscriptions
for select to authenticated
using (public.has_workspace_role(workspace_id, 'admin'));

-- Desktop sessions
create policy desktop_sessions_select_own on public.desktop_device_sessions
for select to authenticated
using (user_id = auth.uid());

create policy desktop_sessions_delete_own on public.desktop_device_sessions
for delete to authenticated
using (user_id = auth.uid());

-- Idempotency records are owner-readable; writes usually happen in API service.
create policy idempotency_keys_select_own on public.idempotency_keys
for select to authenticated
using (owner_user_id = auth.uid());

-- Audit logs: workspace admins only.
create policy audit_logs_select_admin on public.audit_logs
for select to authenticated
using (workspace_id is not null and public.has_workspace_role(workspace_id, 'admin'));

-- Backend-only tables/columns. These explicit revokes prevent accidental PostgREST exposure.
revoke all on public.provider_connections from anon, authenticated;
revoke all on public.document_parse_jobs from anon, authenticated;
revoke all on public.document_block_embeddings from anon, authenticated;
revoke all on public.agent_run_events from anon, authenticated;
revoke all on public.usage_ledger from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.outbox_events from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

-- Read-only projection tables may be granted if direct Supabase use is intentionally adopted later.
-- Current architecture accesses all product data through the backend API.
revoke all on all tables in schema public from anon;

commit;
