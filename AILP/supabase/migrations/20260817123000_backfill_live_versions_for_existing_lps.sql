with missing_live_versions as (
  select
    lp.id as lp_project_id,
    lp.folder_path,
    lp.public_url
  from public.lp_projects lp
  left join public.git_versions gv
    on gv.lp_project_id = lp.id
   and gv.is_production = true
  where gv.id is null
),
inserted_versions as (
  insert into public.git_versions (
    lp_project_id,
    version_label,
    branch,
    commit_sha,
    folder_path,
    change_summary,
    is_production,
    published_at
  )
  select
    mlv.lp_project_id,
    'v1',
    'main',
    'legacy-live-' || replace(mlv.lp_project_id::text, '-', ''),
    mlv.folder_path,
    'Imported current live LP state before VPS automation',
    true,
    now()
  from missing_live_versions mlv
  on conflict (lp_project_id, commit_sha) do nothing
  returning lp_project_id, commit_sha
)
insert into public.production_deployments (
  lp_project_id,
  provider,
  deploy_id,
  deploy_url,
  commit_sha,
  public_url,
  status,
  deployed_at
)
select
  mlv.lp_project_id,
  'netlify',
  'imported-' || replace(mlv.lp_project_id::text, '-', ''),
  mlv.public_url,
  'legacy-live-' || replace(mlv.lp_project_id::text, '-', ''),
  mlv.public_url,
  'imported',
  now()
from missing_live_versions mlv
where not exists (
  select 1
  from public.production_deployments pd
  where pd.lp_project_id = mlv.lp_project_id
);
