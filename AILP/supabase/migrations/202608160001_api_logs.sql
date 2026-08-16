create table public.api_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  function_name text not null,
  stage text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  lp_project_id uuid references public.lp_projects(id) on delete set null,
  app_job_id uuid references public.app_jobs(id) on delete set null,
  http_method text,
  status_code integer,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index api_logs_request_id_idx on public.api_logs (request_id, created_at);
create index api_logs_function_name_idx on public.api_logs (function_name, created_at desc);
create index api_logs_lp_project_id_idx on public.api_logs (lp_project_id, created_at desc);

alter table public.api_logs enable row level security;

create policy "api_logs_admin_only"
on public.api_logs for select
to authenticated
using (public.is_admin());
