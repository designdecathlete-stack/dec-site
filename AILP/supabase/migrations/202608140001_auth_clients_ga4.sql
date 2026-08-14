create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'lp_dashboard');
create type public.ai_request_status as enum (
  'requested',
  'analyzing',
  'preview_ready',
  'approved',
  'published',
  'failed',
  'canceled'
);
create type public.ga4_sync_status as enum ('queued', 'running', 'succeeded', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ga4_property_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  client_id uuid references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, client_id),
  constraint lp_dashboard_role_requires_client check (
    (role = 'admin' and client_id is null)
    or (role = 'lp_dashboard' and client_id is not null)
  )
);

create unique index user_roles_one_admin_role_per_user
on public.user_roles (user_id)
where role = 'admin' and client_id is null;

create table public.lp_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null,
  folder_path text not null,
  public_url text not null,
  ga4_page_path text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug),
  unique (folder_path)
);

create table public.ga4_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  metric_date date not null,
  source_medium text not null default '(all)',
  sessions integer not null default 0,
  total_users integer not null default 0,
  screen_page_views integer not null default 0,
  conversions integer not null default 0,
  event_count integer not null default 0,
  engagement_rate numeric(8, 4),
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (lp_project_id, metric_date, source_medium)
);

create table public.ga4_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  lp_project_id uuid references public.lp_projects(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  status public.ga4_sync_status not null default 'queued',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.integration_secret_refs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  purpose text not null,
  storage_type text not null,
  secret_name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, purpose),
  constraint integration_secret_refs_storage_type check (
    storage_type in ('edge_function_secret', 'supabase_vault', 'external')
  )
);

create table public.ai_analysis_results (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  ga4_metric_date_from date,
  ga4_metric_date_to date,
  score integer,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ai_change_requests (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  instruction text not null,
  status public.ai_request_status not null default 'requested',
  before_commit_sha text,
  work_branch text,
  after_commit_sha text,
  preview_url text,
  result_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger set_lp_projects_updated_at
before update on public.lp_projects
for each row execute function public.set_updated_at();

create trigger set_ai_change_requests_updated_at
before update on public.ai_change_requests
for each row execute function public.set_updated_at();

create trigger set_integration_secret_refs_updated_at
before update on public.integration_secret_refs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
      and client_id is null
  );
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = 'lp_dashboard'
        and client_id = target_client_id
    );
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.user_roles enable row level security;
alter table public.lp_projects enable row level security;
alter table public.ga4_daily_metrics enable row level security;
alter table public.ga4_sync_jobs enable row level security;
alter table public.integration_secret_refs enable row level security;
alter table public.ai_analysis_results enable row level security;
alter table public.ai_change_requests enable row level security;

create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "clients_select_by_role"
on public.clients for select
to authenticated
using (public.can_access_client(id));

create policy "clients_admin_write"
on public.clients for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "user_roles_select_admin_or_self"
on public.user_roles for select
to authenticated
using (public.is_admin() or user_id = auth.uid());

create policy "user_roles_admin_write"
on public.user_roles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "lp_projects_select_by_client_role"
on public.lp_projects for select
to authenticated
using (public.can_access_client(client_id));

create policy "lp_projects_admin_write"
on public.lp_projects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "ga4_metrics_select_by_client_role"
on public.ga4_daily_metrics for select
to authenticated
using (
  exists (
    select 1
    from public.lp_projects lp
    where lp.id = ga4_daily_metrics.lp_project_id
      and public.can_access_client(lp.client_id)
  )
);

create policy "ga4_metrics_admin_write"
on public.ga4_daily_metrics for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "ga4_sync_jobs_admin_only"
on public.ga4_sync_jobs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "integration_secret_refs_admin_only"
on public.integration_secret_refs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "ai_analysis_select_by_client_role"
on public.ai_analysis_results for select
to authenticated
using (
  exists (
    select 1
    from public.lp_projects lp
    where lp.id = ai_analysis_results.lp_project_id
      and public.can_access_client(lp.client_id)
  )
);

create policy "ai_analysis_admin_write"
on public.ai_analysis_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "ai_change_requests_select_by_client_role"
on public.ai_change_requests for select
to authenticated
using (
  exists (
    select 1
    from public.lp_projects lp
    where lp.id = ai_change_requests.lp_project_id
      and public.can_access_client(lp.client_id)
  )
);

create policy "ai_change_requests_insert_by_client_role"
on public.ai_change_requests for insert
to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1
    from public.lp_projects lp
    where lp.id = ai_change_requests.lp_project_id
      and public.can_access_client(lp.client_id)
  )
);

create policy "ai_change_requests_admin_update"
on public.ai_change_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
