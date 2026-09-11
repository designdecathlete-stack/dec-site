alter table public.lp_jobs
  drop constraint if exists lp_jobs_job_type_check;

alter table public.lp_jobs
  add constraint lp_jobs_job_type_check
  check (job_type in (
    'propose_improvements',
    'analyze_lp',
    'create_draft_version',
    'create_preview_folder',
    'apply_to_draft',
    'publish_version'
  ));

notify pgrst, 'reload schema';
