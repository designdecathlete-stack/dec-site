alter table public.git_versions
  add column if not exists published_at timestamptz,
  add column if not exists replaced_at timestamptz;

create unique index if not exists git_versions_one_live_version_per_lp_idx
on public.git_versions (lp_project_id)
where is_production = true;

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
  c.ga4_property_id,
  lp.name as lp_name,
  lp.slug as lp_slug,
  lp.folder_path,
  lp.public_url,
  lp.ga4_page_path,
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
    when c.ga4_property_id is not null and lp.ga4_page_path is not null and lp.ga4_page_path <> '' then 'configured'
    when c.ga4_property_id is not null or lp.ga4_page_path is not null then 'partial'
    else 'missing'
  end as ga4_connection_status,
  case
    when live_version.live_git_version_id is not null then 'live'
    when latest_deploy.latest_production_deployment_id is not null then 'deployed_without_live_flag'
    else 'not_published'
  end as publish_status
from public.lp_projects lp
join public.clients c on c.id = lp.client_id
left join metric_rollups on metric_rollups.lp_project_id = lp.id
left join latest_sync on latest_sync.lp_project_id = lp.id
left join latest_analysis on latest_analysis.lp_project_id = lp.id
left join live_version on live_version.lp_project_id = lp.id
left join latest_deploy on latest_deploy.lp_project_id = lp.id;

create or replace view public.api_logs_overview
with (security_invoker = true)
as
select
  l.id,
  l.request_id,
  l.function_name,
  l.stage,
  l.level,
  l.message,
  l.actor_user_id,
  p.email as actor_email,
  l.client_id,
  c.name as client_name,
  l.lp_project_id,
  lp.name as lp_name,
  lp.folder_path,
  l.app_job_id,
  l.http_method,
  l.status_code,
  l.duration_ms,
  l.metadata,
  l.created_at
from public.api_logs l
left join public.profiles p on p.id = l.actor_user_id
left join public.clients c on c.id = l.client_id
left join public.lp_projects lp on lp.id = l.lp_project_id;

grant select on public.lp_dashboard_overview to authenticated;
grant select on public.api_logs_overview to authenticated;
