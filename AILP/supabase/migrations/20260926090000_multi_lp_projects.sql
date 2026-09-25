-- ailp-manager: support multiple LPs per client while preserving existing public URLs.
-- Existing root folders such as /marr/ are treated as the primary LP (LP1).
-- Additional LPs use child folders such as /marr/lp2/ and keep LP-scoped GA4/GTM settings.

alter table public.lp_projects
  add column if not exists lp_number integer,
  add column if not exists is_primary boolean not null default false,
  add column if not exists parent_lp_project_id uuid references public.lp_projects(id) on delete set null,
  add column if not exists creation_method text not null default 'manual',
  add column if not exists template_key text;

alter table public.lp_projects
  drop constraint if exists lp_projects_lp_number_positive,
  add constraint lp_projects_lp_number_positive check (lp_number is null or lp_number >= 1);

alter table public.lp_projects
  drop constraint if exists lp_projects_creation_method_check,
  add constraint lp_projects_creation_method_check
  check (creation_method in ('manual', 'import', 'copy_current_lp', 'template'));

with ranked as (
  select
    lp.id,
    row_number() over (
      partition by lp.client_id
      order by
        case when position('/' in trim(both '/' from lp.folder_path)) = 0 then 0 else 1 end,
        lp.created_at,
        lp.id
    ) as rn,
    case when position('/' in trim(both '/' from lp.folder_path)) = 0 then true else false end as root_folder
  from public.lp_projects lp
)
update public.lp_projects lp
set
  lp_number = coalesce(lp.lp_number, ranked.rn::integer),
  is_primary = case
    when lp.is_primary then true
    when ranked.root_folder and ranked.rn = 1 then true
    else false
  end,
  creation_method = case
    when lp.creation_method <> 'manual' then lp.creation_method
    when ranked.rn = 1 then 'import'
    else 'manual'
  end
from ranked
where ranked.id = lp.id;

with primary_lp as (
  select distinct on (client_id) id, client_id
  from public.lp_projects
  where is_primary = true
  order by client_id, created_at, id
)
update public.lp_projects lp
set parent_lp_project_id = coalesce(lp.parent_lp_project_id, primary_lp.id)
from primary_lp
where primary_lp.client_id = lp.client_id
  and lp.id <> primary_lp.id;

create unique index if not exists lp_projects_one_primary_per_client_idx
on public.lp_projects (client_id)
where is_primary = true;

create unique index if not exists lp_projects_client_lp_number_idx
on public.lp_projects (client_id, lp_number)
where lp_number is not null;

comment on column public.lp_projects.lp_number is 'Client-scoped LP number. Existing root LPs are LP1; copied/template LPs use LP2, LP3, ...';
comment on column public.lp_projects.is_primary is 'True for the client primary LP. Existing public URLs such as /marr/ are kept here.';
comment on column public.lp_projects.parent_lp_project_id is 'Source or primary LP used to create this LP variant.';
comment on column public.lp_projects.creation_method is 'manual, import, copy_current_lp, or template.';
comment on column public.lp_projects.template_key is 'Optional template identifier used when the LP was created from a template.';

notify pgrst, 'reload schema';
