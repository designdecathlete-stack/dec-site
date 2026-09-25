-- ailp-manager: store GA4 event counts per LP so dashboard CTA / LINE / reservation values are real data.

create table if not exists public.ga4_daily_events (
  id uuid primary key default gen_random_uuid(),
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  metric_date date not null,
  event_name text not null,
  event_count integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (lp_project_id, metric_date, event_name)
);

alter table public.ga4_daily_events enable row level security;
revoke all on public.ga4_daily_events from public, anon, authenticated;
grant select on public.ga4_daily_events to authenticated;
grant all on public.ga4_daily_events to service_role;

drop policy if exists ga4_daily_events_select_by_membership on public.ga4_daily_events;
create policy ga4_daily_events_select_by_membership
on public.ga4_daily_events for select
to authenticated
using (
  exists (
    select 1
    from public.lp_projects lp
    where lp.id = ga4_daily_events.lp_project_id
      and public.can_access_client(lp.client_id)
  )
);

drop policy if exists ga4_daily_events_admin_write on public.ga4_daily_events;
create policy ga4_daily_events_admin_write
on public.ga4_daily_events for all
to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create or replace view public.lp_dashboard_overview
with (security_invoker = true)
as
with metric_rollups as (
  select
    m.lp_project_id,
    sum(m.sessions) filter (where m.metric_date >= current_date - interval '29 days')::bigint as sessions_30d,
    sum(m.total_users) filter (where m.metric_date >= current_date - interval '29 days')::bigint as total_users_30d,
    sum(m.screen_page_views) filter (where m.metric_date >= current_date - interval '29 days')::bigint as page_views_30d,
    sum(m.conversions) filter (where m.metric_date >= current_date - interval '29 days')::bigint as conversions_30d,
    round(avg(m.engagement_rate) filter (where m.metric_date >= current_date - interval '29 days'), 4) as avg_engagement_rate_30d,
    max(m.metric_date) as last_metric_date,
    max(m.synced_at) as last_metric_synced_at
  from public.ga4_daily_metrics m
  group by m.lp_project_id
),
event_rollups as (
  select
    e.lp_project_id,
    sum(e.event_count) filter (where e.metric_date >= current_date - interval '29 days')::bigint as tracked_events_30d,
    sum(e.event_count) filter (where e.metric_date >= current_date - interval '29 days' and e.event_name in ('cta_click', 'lp_cta_click'))::bigint as cta_clicks_30d,
    sum(e.event_count) filter (where e.metric_date >= current_date - interval '29 days' and e.event_name in ('line_click', 'line_tap', 'click_line'))::bigint as line_clicks_30d,
    sum(e.event_count) filter (where e.metric_date >= current_date - interval '29 days' and e.event_name in ('reservation_click', 'booking_click', 'reserve_click', 'hotpepper_click'))::bigint as reservation_clicks_30d,
    max(e.synced_at) as last_event_synced_at
  from public.ga4_daily_events e
  group by e.lp_project_id
),
latest_sync as (
  select distinct on (j.lp_project_id)
    j.lp_project_id,
    j.id as latest_sync_job_id,
    j.status as latest_sync_status,
    j.error_message as latest_sync_error_message,
    j.started_at as latest_sync_started_at,
    j.finished_at as latest_sync_finished_at,
    j.created_at as latest_sync_created_at
  from public.ga4_sync_jobs j
  where j.lp_project_id is not null
  order by j.lp_project_id, coalesce(j.finished_at, j.started_at, j.created_at) desc, j.created_at desc
),
live_version as (
  select distinct on (g.lp_project_id)
    g.lp_project_id,
    g.id as live_git_version_id,
    g.version_label as live_version_label,
    g.commit_sha as live_commit_sha,
    g.branch as live_branch,
    g.change_summary as live_change_summary,
    g.published_at as live_published_at,
    g.replaced_at as live_replaced_at
  from public.git_versions g
  where g.is_production = true
  order by g.lp_project_id, coalesce(g.published_at, g.created_at) desc, g.created_at desc
),
latest_deploy as (
  select distinct on (d.lp_project_id)
    d.lp_project_id,
    d.id as latest_production_deployment_id,
    d.deploy_id as latest_production_deploy_id,
    d.deploy_url as latest_production_deploy_url,
    d.commit_sha as latest_production_commit_sha,
    d.status as latest_production_status,
    d.deployed_at as latest_production_deployed_at,
    d.created_at as latest_production_created_at
  from public.production_deployments d
  order by d.lp_project_id, coalesce(d.deployed_at, d.created_at) desc, d.created_at desc
),
latest_analysis as (
  select distinct on (a.lp_project_id)
    a.lp_project_id,
    a.id as latest_analysis_result_id,
    a.score as latest_analysis_score,
    a.summary as latest_analysis_summary,
    a.created_at as latest_analysis_created_at
  from public.ai_analysis_results a
  order by a.lp_project_id, a.created_at desc
)
select
  lp.id as lp_project_id,
  lp.client_id,
  c.name as client_name,
  c.slug as client_slug,
  analytics.ga4_property_id,
  lp.name as lp_name,
  lp.slug as lp_slug,
  lp.folder_path,
  lp.public_url,
  analytics.ga4_page_path,
  lp.status as lp_status,
  coalesce(metric_rollups.sessions_30d, 0) as sessions_30d,
  coalesce(metric_rollups.total_users_30d, 0) as total_users_30d,
  coalesce(metric_rollups.page_views_30d, 0) as page_views_30d,
  coalesce(metric_rollups.conversions_30d, 0) as conversions_30d,
  case
    when coalesce(metric_rollups.sessions_30d, 0) > 0
      then round((coalesce(metric_rollups.conversions_30d, 0)::numeric / metric_rollups.sessions_30d::numeric) * 100, 2)
    else null
  end as conversion_rate_30d,
  metric_rollups.avg_engagement_rate_30d,
  metric_rollups.last_metric_date,
  metric_rollups.last_metric_synced_at,
  latest_sync.latest_sync_job_id,
  latest_sync.latest_sync_status,
  latest_sync.latest_sync_error_message,
  latest_sync.latest_sync_started_at,
  latest_sync.latest_sync_finished_at,
  latest_analysis.latest_analysis_result_id,
  latest_analysis.latest_analysis_score,
  latest_analysis.latest_analysis_summary,
  latest_analysis.latest_analysis_created_at,
  live_version.live_git_version_id,
  live_version.live_version_label,
  live_version.live_commit_sha,
  live_version.live_branch,
  live_version.live_change_summary,
  live_version.live_published_at,
  live_version.live_replaced_at,
  latest_deploy.latest_production_deployment_id,
  latest_deploy.latest_production_deploy_id,
  latest_deploy.latest_production_deploy_url,
  latest_deploy.latest_production_commit_sha,
  latest_deploy.latest_production_status,
  latest_deploy.latest_production_deployed_at,
  case
    when not analytics.is_active then 'disabled'
    when analytics.ga4_property_id is not null and analytics.ga4_page_path is not null and analytics.ga4_page_path <> '' then 'configured'
    when analytics.ga4_property_id is not null or analytics.ga4_page_path is not null then 'partial'
    else 'missing'
  end as ga4_connection_status,
  case
    when live_version.live_git_version_id is not null then 'live'
    when latest_deploy.latest_production_deployment_id is not null then 'deployed_without_live_flag'
    else 'not_published'
  end as publish_status,
  analytics.ga4_measurement_id,
  analytics.gtm_container_id,
  analytics.is_active as ga4_is_active,
  coalesce(event_rollups.tracked_events_30d, 0) as tracked_events_30d,
  coalesce(event_rollups.cta_clicks_30d, 0) as cta_clicks_30d,
  coalesce(event_rollups.line_clicks_30d, 0) as line_clicks_30d,
  coalesce(event_rollups.reservation_clicks_30d, 0) as reservation_clicks_30d,
  case when coalesce(metric_rollups.sessions_30d, 0) > 0 then round((coalesce(event_rollups.cta_clicks_30d, 0)::numeric / metric_rollups.sessions_30d::numeric) * 100, 2) else null end as cta_click_rate_30d,
  case when coalesce(metric_rollups.sessions_30d, 0) > 0 then round((coalesce(event_rollups.reservation_clicks_30d, 0)::numeric / metric_rollups.sessions_30d::numeric) * 100, 2) else null end as reservation_click_rate_30d,
  event_rollups.last_event_synced_at
from public.lp_projects lp
join public.clients c on c.id = lp.client_id
left join public.lp_analytics_settings settings on settings.lp_project_id = lp.id
cross join lateral (
  select
    coalesce(nullif(btrim(settings.ga4_property_id), ''), nullif(btrim(c.ga4_property_id), '')) as ga4_property_id,
    coalesce(nullif(btrim(settings.ga4_page_path), ''), nullif(btrim(lp.ga4_page_path), '')) as ga4_page_path,
    settings.ga4_measurement_id,
    settings.gtm_container_id,
    coalesce(settings.is_active, true) as is_active
) analytics
left join metric_rollups on metric_rollups.lp_project_id = lp.id
left join event_rollups on event_rollups.lp_project_id = lp.id
left join latest_sync on latest_sync.lp_project_id = lp.id
left join latest_analysis on latest_analysis.lp_project_id = lp.id
left join live_version on live_version.lp_project_id = lp.id
left join latest_deploy on latest_deploy.lp_project_id = lp.id;

grant select on public.lp_dashboard_overview to authenticated;
notify pgrst, 'reload schema';
