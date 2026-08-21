create or replace function public.generate_lp_analysis(
  target_lp_project_id uuid,
  requested_by_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dashboard_row public.lp_dashboard_overview%rowtype;
  analysis_id uuid;
  score_value integer := 100;
  findings_value jsonb := '[]'::jsonb;
  recommendations_value jsonb := '[]'::jsonb;
  sessions_30d numeric := 0;
  conversions_30d numeric := 0;
  conversion_rate_30d numeric := 0;
  page_views_30d numeric := 0;
  total_users_30d numeric := 0;
  avg_engagement_rate_30d numeric := 0;
  page_depth numeric := 0;
begin
  if target_lp_project_id is null then
    raise exception 'target_lp_project_id is required';
  end if;

  if requested_by_user_id is null then
    raise exception 'requested_by_user_id is required';
  end if;

  if not public.is_admin() and not public.user_can_access_lp(target_lp_project_id) then
    raise exception 'permission denied for lp_project_id %', target_lp_project_id;
  end if;

  select *
  into dashboard_row
  from public.lp_dashboard_overview
  where lp_project_id = target_lp_project_id;

  if dashboard_row.lp_project_id is null then
    raise exception 'lp_dashboard_overview row not found for %', target_lp_project_id;
  end if;

  sessions_30d := coalesce(dashboard_row.sessions_30d, 0);
  conversions_30d := coalesce(dashboard_row.conversions_30d, 0);
  conversion_rate_30d := coalesce(dashboard_row.conversion_rate_30d, 0);
  page_views_30d := coalesce(dashboard_row.page_views_30d, 0);
  total_users_30d := coalesce(dashboard_row.total_users_30d, 0);
  avg_engagement_rate_30d := coalesce(dashboard_row.avg_engagement_rate_30d, 0);

  if dashboard_row.ga4_connection_status <> 'configured' then
    findings_value := findings_value || jsonb_build_array(jsonb_build_object(
      'title', 'GA4 setting is incomplete',
      'detail', 'Property ID or page path is missing, so recurring reporting is not reliable yet.',
      'severity', 'high'
    ));
    recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
      'title', 'Complete GA4 settings for this LP',
      'detail', 'Confirm property ID and page path, then run a fresh sync before reviewing KPI trends.',
      'priority', 1
    ));
    score_value := score_value - 25;
  end if;

  if dashboard_row.latest_sync_status is distinct from 'succeeded' then
    findings_value := findings_value || jsonb_build_array(jsonb_build_object(
      'title', 'Latest GA4 sync has not completed successfully',
      'detail', 'The dashboard is not yet backed by a stable recurring data feed.',
      'severity', 'high'
    ));
    recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
      'title', 'Run GA4 sync again and confirm the latest job succeeds',
      'detail', 'The reporting layer should not be trusted until the latest sync finishes successfully.',
      'priority', 1
    ));
    score_value := score_value - 20;
  end if;

  if sessions_30d = 0 then
    findings_value := findings_value || jsonb_build_array(jsonb_build_object(
      'title', 'No sessions in the last 30 days',
      'detail', 'Traffic is zero for the current 30-day window, so conversion analysis cannot be trusted yet.',
      'severity', 'high'
    ));
    recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
      'title', 'Verify traffic and measurement before editing the LP',
      'detail', 'Confirm the LP is receiving traffic and that GA4 path filtering matches the published URL.',
      'priority', 1
    ));
    score_value := score_value - 30;
  else
    if total_users_30d > 0 then
      page_depth := page_views_30d / total_users_30d;
    end if;

    if conversion_rate_30d < 1 then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'title', 'Conversion rate is low',
        'detail', format('Current CVR is %s%%, which is low relative to the observed traffic volume.', to_char(conversion_rate_30d, 'FM999990.00')),
        'severity', 'medium'
      ));
      recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
        'title', 'Review first-view messaging and primary CTA',
        'detail', 'Focus on the first screen offer, trust signals, and CTA clarity before larger structural edits.',
        'priority', 1
      ));
      score_value := score_value - 18;
    elsif conversion_rate_30d < 3 then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'title', 'Conversion rate has room to improve',
        'detail', format('Current CVR is %s%%. The LP is converting, but not efficiently yet.', to_char(conversion_rate_30d, 'FM999990.00')),
        'severity', 'medium'
      ));
      recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
        'title', 'Test offer framing and CTA wording',
        'detail', 'Keep the structure stable and test tighter offer framing, CTA copy, and proof placement.',
        'priority', 2
      ));
      score_value := score_value - 8;
    else
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'title', 'Conversion rate is in a workable range',
        'detail', format('Current CVR is %s%%. Further changes should be incremental and measured.', to_char(conversion_rate_30d, 'FM999990.00')),
        'severity', 'low'
      ));
      recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
        'title', 'Continue controlled iteration',
        'detail', 'Prefer narrow tests and preserve the current structure unless there is a clear traffic-quality issue.',
        'priority', 3
      ));
    end if;

    if page_depth < 1.2 then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'title', 'Page depth appears shallow',
        'detail', format('Page views per user are %s, which suggests users may not be reaching enough content.', to_char(page_depth, 'FM999990.00')),
        'severity', 'medium'
      ));
      recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
        'title', 'Strengthen above-the-fold relevance',
        'detail', 'Improve first-view clarity, visual hierarchy, and immediate proof so users continue below the fold.',
        'priority', 2
      ));
      score_value := score_value - 10;
    end if;

    if avg_engagement_rate_30d < 0.45 then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'title', 'Engagement rate is weak',
        'detail', format('Average engagement rate is %s%%. Users are not staying engaged long enough.', to_char(avg_engagement_rate_30d * 100, 'FM999990.0')),
        'severity', 'medium'
      ));
      recommendations_value := recommendations_value || jsonb_build_array(jsonb_build_object(
        'title', 'Reduce friction in the early sections',
        'detail', 'Tighten section order, remove low-value copy, and surface proof and offer earlier.',
        'priority', 2
      ));
      score_value := score_value - 10;
    end if;
  end if;

  score_value := greatest(0, least(100, round(score_value)));

  insert into public.ai_analysis_results (
    lp_project_id,
    ga4_metric_date_from,
    ga4_metric_date_to,
    score,
    summary,
    findings,
    recommendations,
    model,
    created_by
  )
  values (
    target_lp_project_id,
    current_date - interval '29 days',
    current_date,
    score_value,
    format(
      '%s / %s: sessions %s, conversions %s, CVR %s%%. Latest sync %s%s.',
      dashboard_row.client_name,
      dashboard_row.lp_name,
      sessions_30d::bigint,
      conversions_30d::bigint,
      to_char(conversion_rate_30d, 'FM999990.00'),
      coalesce(dashboard_row.latest_sync_status, 'unknown'),
      case
        when dashboard_row.latest_sync_finished_at is not null
          then ' at ' || dashboard_row.latest_sync_finished_at::text
        else ''
      end
    ),
    findings_value,
    recommendations_value,
    'sql-heuristic-v1',
    requested_by_user_id
  )
  returning id into analysis_id;

  return analysis_id;
end;
$$;

grant execute on function public.generate_lp_analysis(uuid, uuid) to authenticated;
