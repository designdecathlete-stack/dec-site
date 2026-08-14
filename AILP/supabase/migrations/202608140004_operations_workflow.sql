create type public.app_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled'
);

create type public.approval_status as enum (
  'draft',
  'pending',
  'approved',
  'rejected',
  'published',
  'canceled'
);

create type public.notification_status as enum ('unread', 'read', 'archived');

create table public.app_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status public.app_job_status not null default 'queued',
  lp_project_id uuid references public.lp_projects(id) on delete set null,
  ai_change_request_id uuid references public.ai_change_requests(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  ai_change_request_id uuid references public.ai_change_requests(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status public.approval_status not null default 'draft',
  title text not null,
  summary text,
  preview_url text,
  before_commit_sha text,
  after_commit_sha text,
  requested_at timestamptz,
  decided_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preview_deployments (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  ai_change_request_id uuid references public.ai_change_requests(id) on delete set null,
  provider text not null default 'netlify',
  deploy_id text,
  deploy_url text not null,
  branch text,
  commit_sha text,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.git_versions (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  ai_change_request_id uuid references public.ai_change_requests(id) on delete set null,
  version_label text,
  branch text,
  commit_sha text not null,
  parent_commit_sha text,
  folder_path text not null,
  change_summary text,
  is_production boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lp_project_id, commit_sha)
);

create table public.production_deployments (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  provider text not null default 'netlify',
  deploy_id text,
  deploy_url text,
  commit_sha text not null,
  public_url text not null,
  status text not null default 'queued',
  deployed_by uuid references public.profiles(id) on delete set null,
  deployed_at timestamptz,
  rollback_to_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lp_file_metadata (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  file_path text not null,
  file_type text not null,
  purpose text,
  checksum text,
  meta jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lp_project_id, file_path)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  lp_project_id uuid references public.lp_projects(id) on delete cascade,
  title text not null,
  body text,
  status public.notification_status not null default 'unread',
  action_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  client_id uuid references public.clients(id) on delete set null,
  lp_project_id uuid references public.lp_projects(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.client_id_from_lp(target_lp_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id
  from public.lp_projects
  where id = target_lp_project_id;
$$;

create trigger set_app_jobs_updated_at
before update on public.app_jobs
for each row execute function public.set_updated_at();

create trigger set_approval_requests_updated_at
before update on public.approval_requests
for each row execute function public.set_updated_at();

create trigger set_preview_deployments_updated_at
before update on public.preview_deployments
for each row execute function public.set_updated_at();

create trigger set_production_deployments_updated_at
before update on public.production_deployments
for each row execute function public.set_updated_at();

create trigger set_lp_file_metadata_updated_at
before update on public.lp_file_metadata
for each row execute function public.set_updated_at();

alter table public.app_jobs enable row level security;
alter table public.approval_requests enable row level security;
alter table public.preview_deployments enable row level security;
alter table public.git_versions enable row level security;
alter table public.production_deployments enable row level security;
alter table public.lp_file_metadata enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "app_jobs_admin_only"
on public.app_jobs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "approval_requests_select_by_client_role"
on public.approval_requests for select
to authenticated
using (public.can_access_client(client_id_from_lp(lp_project_id)));

create policy "approval_requests_admin_write"
on public.approval_requests for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "preview_deployments_select_by_client_role"
on public.preview_deployments for select
to authenticated
using (public.can_access_client(client_id_from_lp(lp_project_id)));

create policy "preview_deployments_admin_write"
on public.preview_deployments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "git_versions_select_by_client_role"
on public.git_versions for select
to authenticated
using (public.can_access_client(client_id_from_lp(lp_project_id)));

create policy "git_versions_admin_write"
on public.git_versions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "production_deployments_select_by_client_role"
on public.production_deployments for select
to authenticated
using (public.can_access_client(client_id_from_lp(lp_project_id)));

create policy "production_deployments_admin_write"
on public.production_deployments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "lp_file_metadata_select_by_client_role"
on public.lp_file_metadata for select
to authenticated
using (public.can_access_client(client_id_from_lp(lp_project_id)));

create policy "lp_file_metadata_admin_write"
on public.lp_file_metadata for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "notifications_select_target_or_admin"
on public.notifications for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or (client_id is not null and public.can_access_client(client_id))
);

create policy "notifications_update_own_read_state"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "notifications_admin_write"
on public.notifications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "audit_logs_admin_only"
on public.audit_logs for select
to authenticated
using (public.is_admin());
