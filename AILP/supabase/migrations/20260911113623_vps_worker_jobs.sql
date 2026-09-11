create table public.lp_jobs (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  priority integer not null default 100,
  instruction text,
  payload jsonb not null default '{}'::jsonb,
  result_summary text,
  error_message text,
  git_branch text,
  commit_sha text,
  preview_url text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lp_jobs_job_type_check check (job_type in (
    'propose_improvements',
    'analyze_lp',
    'create_draft_version',
    'publish_version'
  )),
  constraint lp_jobs_status_check check (status in (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled'
  ))
);

create table public.lp_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lp_jobs(id) on delete cascade,
  step text not null,
  status text not null default 'succeeded',
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lp_job_steps_status_check check (status in (
    'running',
    'succeeded',
    'failed',
    'skipped'
  ))
);

create table public.lp_job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.lp_jobs(id) on delete cascade,
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  artifact_type text not null,
  file_path text,
  git_branch text,
  commit_sha text,
  preview_url text,
  diff_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.lp_ai_interactions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.lp_jobs(id) on delete set null,
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  provider text not null default 'openai',
  model text not null,
  action_type text not null,
  prompt_summary text,
  response_summary text,
  input_refs jsonb not null default '[]'::jsonb,
  output_refs jsonb not null default '[]'::jsonb,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  estimated_cost_jpy numeric(12, 3),
  status text not null default 'succeeded',
  error_message text,
  created_at timestamptz not null default now(),
  constraint lp_ai_interactions_status_check check (status in ('succeeded', 'failed'))
);

create table public.lp_ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  job_id uuid references public.lp_jobs(id) on delete set null,
  ai_interaction_id uuid references public.lp_ai_interactions(id) on delete set null,
  provider text not null default 'openai',
  model text not null,
  action_type text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  total_tokens integer not null default 0,
  input_unit_price_usd numeric(12, 8),
  output_unit_price_usd numeric(12, 8),
  cached_input_unit_price_usd numeric(12, 8),
  estimated_cost_usd numeric(12, 6),
  estimated_cost_jpy numeric(12, 3),
  pricing_source text,
  pricing_version text,
  status text not null default 'succeeded',
  created_at timestamptz not null default now(),
  constraint lp_ai_usage_logs_status_check check (status in ('succeeded', 'failed'))
);

create table public.lp_ai_budget_settings (
  lp_project_id uuid primary key references public.lp_projects(id) on delete cascade,
  monthly_budget_jpy integer,
  hard_stop_enabled boolean not null default false,
  alert_threshold_percent integer not null default 80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lp_ai_budget_alert_threshold_check check (
    alert_threshold_percent >= 1 and alert_threshold_percent <= 100
  )
);

create trigger set_lp_jobs_updated_at
before update on public.lp_jobs
for each row execute function public.set_updated_at();

create trigger set_lp_ai_budget_settings_updated_at
before update on public.lp_ai_budget_settings
for each row execute function public.set_updated_at();

create index lp_jobs_lp_project_id_created_at_idx on public.lp_jobs (lp_project_id, created_at desc);
create index lp_jobs_status_priority_created_at_idx on public.lp_jobs (status, priority, created_at);
create index lp_job_steps_job_id_created_at_idx on public.lp_job_steps (job_id, created_at);
create index lp_job_artifacts_job_id_created_at_idx on public.lp_job_artifacts (job_id, created_at);
create index lp_ai_interactions_lp_project_id_created_at_idx on public.lp_ai_interactions (lp_project_id, created_at desc);
create index lp_ai_usage_logs_client_month_idx on public.lp_ai_usage_logs (client_id, created_at desc);
create index lp_ai_usage_logs_lp_month_idx on public.lp_ai_usage_logs (lp_project_id, created_at desc);

alter table public.lp_jobs enable row level security;
alter table public.lp_job_steps enable row level security;
alter table public.lp_job_artifacts enable row level security;
alter table public.lp_ai_interactions enable row level security;
alter table public.lp_ai_usage_logs enable row level security;
alter table public.lp_ai_budget_settings enable row level security;

revoke all on public.lp_jobs from public, anon, authenticated;
revoke all on public.lp_job_steps from public, anon, authenticated;
revoke all on public.lp_job_artifacts from public, anon, authenticated;
revoke all on public.lp_ai_interactions from public, anon, authenticated;
revoke all on public.lp_ai_usage_logs from public, anon, authenticated;
revoke all on public.lp_ai_budget_settings from public, anon, authenticated;

grant select, insert, update, delete on public.lp_jobs to authenticated;
grant select on public.lp_job_steps to authenticated;
grant select on public.lp_job_artifacts to authenticated;
grant select on public.lp_ai_interactions to authenticated;
grant select on public.lp_ai_usage_logs to authenticated;
grant select, insert, update, delete on public.lp_ai_budget_settings to authenticated;

grant all on public.lp_jobs to service_role;
grant all on public.lp_job_steps to service_role;
grant all on public.lp_job_artifacts to service_role;
grant all on public.lp_ai_interactions to service_role;
grant all on public.lp_ai_usage_logs to service_role;
grant all on public.lp_ai_budget_settings to service_role;

create policy lp_jobs_admin_all
on public.lp_jobs for all to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy lp_jobs_member_select
on public.lp_jobs for select to authenticated
using (
  exists (
    select 1
    from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_jobs.lp_project_id
  )
);

create policy lp_job_steps_admin_select
on public.lp_job_steps for select to authenticated
using ((select public.current_user_is_admin()));

create policy lp_job_steps_member_select
on public.lp_job_steps for select to authenticated
using (
  exists (
    select 1
    from public.lp_jobs job
    join public.lp_user_memberships membership on membership.lp_project_id = job.lp_project_id
    join public.lp_projects lp on lp.id = job.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where job.id = lp_job_steps.job_id
      and membership.user_id = (select auth.uid())
  )
);

create policy lp_job_artifacts_admin_select
on public.lp_job_artifacts for select to authenticated
using ((select public.current_user_is_admin()));

create policy lp_job_artifacts_member_select
on public.lp_job_artifacts for select to authenticated
using (
  exists (
    select 1
    from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_job_artifacts.lp_project_id
  )
);

create policy lp_ai_interactions_admin_select
on public.lp_ai_interactions for select to authenticated
using ((select public.current_user_is_admin()));

create policy lp_ai_interactions_member_select
on public.lp_ai_interactions for select to authenticated
using (
  exists (
    select 1
    from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_ai_interactions.lp_project_id
  )
);

create policy lp_ai_usage_logs_admin_select
on public.lp_ai_usage_logs for select to authenticated
using ((select public.current_user_is_admin()));

create policy lp_ai_usage_logs_member_select
on public.lp_ai_usage_logs for select to authenticated
using (
  exists (
    select 1
    from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_ai_usage_logs.lp_project_id
  )
);

create policy lp_ai_budget_settings_admin_all
on public.lp_ai_budget_settings for all to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy lp_ai_budget_settings_member_select
on public.lp_ai_budget_settings for select to authenticated
using (
  exists (
    select 1
    from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_ai_budget_settings.lp_project_id
  )
);

create or replace view public.lp_ai_usage_monthly_overview
with (security_invoker = true) as
select
  usage.client_id,
  c.name as client_name,
  usage.lp_project_id,
  lp.name as lp_name,
  date_trunc('month', usage.created_at)::date as usage_month,
  count(*) as interaction_count,
  coalesce(sum(usage.input_tokens), 0) as input_tokens,
  coalesce(sum(usage.output_tokens), 0) as output_tokens,
  coalesce(sum(usage.total_tokens), 0) as total_tokens,
  coalesce(sum(usage.estimated_cost_usd), 0)::numeric(12, 6) as estimated_cost_usd,
  coalesce(sum(usage.estimated_cost_jpy), 0)::numeric(12, 3) as estimated_cost_jpy,
  budget.monthly_budget_jpy,
  budget.hard_stop_enabled,
  budget.alert_threshold_percent
from public.lp_ai_usage_logs usage
join public.clients c on c.id = usage.client_id
join public.lp_projects lp on lp.id = usage.lp_project_id
left join public.lp_ai_budget_settings budget on budget.lp_project_id = usage.lp_project_id
group by usage.client_id, c.name, usage.lp_project_id, lp.name, date_trunc('month', usage.created_at),
  budget.monthly_budget_jpy, budget.hard_stop_enabled, budget.alert_threshold_percent;

grant select on public.lp_ai_usage_monthly_overview to authenticated;

notify pgrst, 'reload schema';
