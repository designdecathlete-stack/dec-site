-- ailp-manager: LP-scoped configuration; keep legacy values for fallback.
-- Existing installations use is_admin / lp_project_memberships. Expose the
-- requested names without duplicating memberships or changing access management.
do $compat$
begin
  if to_regprocedure('public.current_user_is_admin()') is null then
    execute $sql$
      create function public.current_user_is_admin() returns boolean
      language sql stable security invoker set search_path = public
      as 'select public.is_admin()'
    $sql$;
    revoke all on function public.current_user_is_admin() from public, anon;
    grant execute on function public.current_user_is_admin() to authenticated, service_role;
  end if;
  if to_regclass('public.lp_user_memberships') is null then
    execute $sql$
      create view public.lp_user_memberships with (security_invoker = true) as
      select user_id, lp_project_id from public.lp_project_memberships
    $sql$;
    revoke all on public.lp_user_memberships from public, anon, authenticated;
    grant select on public.lp_user_memberships to authenticated, service_role;
  end if;
end;
$compat$;

create table public.lp_analytics_settings (
  lp_project_id uuid primary key references public.lp_projects(id) on delete cascade,
  ga4_property_id text,
  ga4_page_path text,
  ga4_measurement_id text,
  gtm_container_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_lp_analytics_settings_updated_at
before update on public.lp_analytics_settings
for each row execute function public.set_updated_at();

alter table public.lp_analytics_settings enable row level security;
revoke all on public.lp_analytics_settings from public, anon, authenticated;
grant select, insert, update, delete on public.lp_analytics_settings to authenticated;
grant all on public.lp_analytics_settings to service_role;

create policy lp_analytics_settings_admin_all
on public.lp_analytics_settings for all to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy lp_analytics_settings_member_select
on public.lp_analytics_settings for select to authenticated
using (
  exists (
    select 1 from public.lp_user_memberships membership
    join public.lp_projects lp on lp.id = membership.lp_project_id
    join public.user_roles ur on ur.user_id = membership.user_id
      and ur.role = 'lp_dashboard'
      and ur.client_id = lp.client_id
    where membership.user_id = (select auth.uid())
      and membership.lp_project_id = lp_analytics_settings.lp_project_id
  )
);

insert into public.lp_analytics_settings (lp_project_id, ga4_property_id, ga4_page_path)
select lp.id, nullif(btrim(c.ga4_property_id), ''), nullif(btrim(lp.ga4_page_path), '')
from public.lp_projects lp
join public.clients c on c.id = lp.client_id
on conflict (lp_project_id) do nothing;

-- Preserve the installed view's column order and all reporting expressions.
-- Some environments already have lp_description while others do not.
-- Replace only the two legacy GA4 references, then append optional settings.
do $overview$
declare
  definition text := pg_get_viewdef('public.lp_dashboard_overview'::regclass, true);
begin
  if position('c.ga4_property_id' in definition) = 0
    or position('lp.ga4_page_path' in definition) = 0
    or position('END AS publish_status' in definition) = 0 then
    raise exception 'Unexpected lp_dashboard_overview definition; review before migrating';
  end if;
  definition := replace(definition, 'c.ga4_property_id', 'analytics.ga4_property_id');
  definition := replace(definition, 'lp.ga4_page_path', 'analytics.ga4_page_path');
  definition := regexp_replace(definition,
    'CASE\s+WHEN analytics.ga4_property_id',
    'CASE WHEN NOT analytics.is_active THEN ''disabled''::text WHEN analytics.ga4_property_id');
  definition := replace(definition, 'END AS publish_status',
    'END AS publish_status, analytics.ga4_measurement_id, analytics.gtm_container_id, analytics.is_active AS ga4_is_active');
  definition := regexp_replace(definition,
    '(JOIN (public\.)?clients c ON \(?c.id = lp.client_id\)?)',
    $join$\1
    LEFT JOIN public.lp_analytics_settings settings ON settings.lp_project_id = lp.id
    CROSS JOIN LATERAL (
      SELECT coalesce(nullif(btrim(settings.ga4_property_id), ''), nullif(btrim(c.ga4_property_id), '')) AS ga4_property_id,
        coalesce(nullif(btrim(settings.ga4_page_path), ''), nullif(btrim(lp.ga4_page_path), '')) AS ga4_page_path,
        settings.ga4_measurement_id, settings.gtm_container_id,
        coalesce(settings.is_active, true) AS is_active
    ) analytics$join$);
  if position('CROSS JOIN LATERAL' in definition) = 0 then
    raise exception 'Could not locate clients join in lp_dashboard_overview';
  end if;
  execute 'create or replace view public.lp_dashboard_overview with (security_invoker = true) as ' || definition;
end;
$overview$;

grant select on public.lp_dashboard_overview to authenticated;
notify pgrst, 'reload schema';
