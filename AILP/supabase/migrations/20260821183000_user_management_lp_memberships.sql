create table public.access_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role public.app_role not null,
  is_active boolean not null default true,
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_users_email_lower check (email = lower(email))
);

create table public.access_user_lp_projects (
  id uuid primary key default gen_random_uuid(),
  access_user_id uuid not null references public.access_users(id) on delete cascade,
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (access_user_id, lp_project_id)
);

create table public.lp_project_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lp_project_id uuid not null references public.lp_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, lp_project_id)
);

create trigger set_access_users_updated_at
before update on public.access_users
for each row execute function public.set_updated_at();

insert into public.access_users (email, role, is_active, is_protected)
values
  ('h.dazai0316@gmail.com', 'admin', true, true),
  ('kanatani@dec-athlete.com', 'admin', true, true)
on conflict (email) do update set
  role = excluded.role,
  is_active = true,
  is_protected = true,
  updated_at = now();

create or replace function public.protect_access_user_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.is_protected then
    raise exception 'protected user % cannot be deleted', old.email;
  end if;

  if tg_op = 'UPDATE' and old.is_protected then
    if new.email <> old.email then
      raise exception 'protected user % email cannot be changed', old.email;
    end if;
    if new.role <> 'admin' then
      raise exception 'protected user % must remain admin', old.email;
    end if;
    if new.is_active = false then
      raise exception 'protected user % cannot be deactivated', old.email;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_access_users_before_write
before update or delete on public.access_users
for each row execute function public.protect_access_user_mutation();

create or replace function public.sync_profile_access(
  target_user_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  access_user_row public.access_users%rowtype;
begin
  delete from public.user_roles
  where user_id = target_user_id;

  delete from public.lp_project_memberships
  where user_id = target_user_id;

  select *
  into access_user_row
  from public.access_users
  where email = lower(coalesce(target_email, ''))
    and is_active = true
  limit 1;

  if access_user_row.id is null then
    return;
  end if;

  if access_user_row.role = 'admin' then
    insert into public.user_roles (user_id, role, client_id)
    values (target_user_id, 'admin', null)
    on conflict do nothing;
    return;
  end if;

  insert into public.lp_project_memberships (user_id, lp_project_id)
  select target_user_id, aulp.lp_project_id
  from public.access_user_lp_projects aulp
  where aulp.access_user_id = access_user_row.id
  on conflict do nothing;

  insert into public.user_roles (user_id, role, client_id)
  select
    target_user_id,
    'lp_dashboard'::public.app_role,
    lp.client_id
  from public.access_user_lp_projects aulp
  join public.lp_projects lp on lp.id = aulp.lp_project_id
  where aulp.access_user_id = access_user_row.id
  group by lp.client_id
  on conflict do nothing;
end;
$$;

create or replace function public.sync_profiles_by_access_email(
  target_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
begin
  for profile_row in
    select id, email
    from public.profiles
    where email = lower(coalesce(target_email, ''))
  loop
    perform public.sync_profile_access(profile_row.id, profile_row.email);
  end loop;
end;
$$;

create or replace function public.sync_profiles_for_access_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_profiles_by_access_email(coalesce(new.email, old.email));
  return coalesce(new, old);
end;
$$;

create trigger sync_profiles_after_access_user_change
after insert or update or delete on public.access_users
for each row execute function public.sync_profiles_for_access_user();

create or replace function public.sync_profiles_for_access_user_lp_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  select email
  into target_email
  from public.access_users
  where id = coalesce(new.access_user_id, old.access_user_id);

  if target_email is not null then
    perform public.sync_profiles_by_access_email(target_email);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger sync_profiles_after_access_user_lp_project_change
after insert or update or delete on public.access_user_lp_projects
for each row execute function public.sync_profiles_for_access_user_lp_project();

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
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  perform public.sync_profile_access(new.id, new.email);

  return new;
end;
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
      from public.lp_project_memberships lpm
      join public.lp_projects lp on lp.id = lpm.lp_project_id
      where lpm.user_id = auth.uid()
        and lp.client_id = target_client_id
    );
$$;

create or replace function public.user_can_access_lp(target_lp_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.lp_project_memberships
      where user_id = auth.uid()
        and lp_project_id = target_lp_project_id
    );
$$;

alter table public.access_users enable row level security;
alter table public.access_user_lp_projects enable row level security;
alter table public.lp_project_memberships enable row level security;

create policy "access_users_admin_only"
on public.access_users for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "access_user_lp_projects_admin_only"
on public.access_user_lp_projects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "lp_project_memberships_select_admin_or_self"
on public.lp_project_memberships for select
to authenticated
using (public.is_admin() or user_id = auth.uid());

create policy "lp_project_memberships_admin_write"
on public.lp_project_memberships for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "lp_projects_select_by_client_role" on public.lp_projects;
create policy "lp_projects_select_by_membership"
on public.lp_projects for select
to authenticated
using (public.user_can_access_lp(id));

drop policy if exists "ga4_metrics_select_by_client_role" on public.ga4_daily_metrics;
create policy "ga4_metrics_select_by_membership"
on public.ga4_daily_metrics for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "ai_analysis_select_by_client_role" on public.ai_analysis_results;
create policy "ai_analysis_select_by_membership"
on public.ai_analysis_results for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "ai_change_requests_select_by_client_role" on public.ai_change_requests;
create policy "ai_change_requests_select_by_membership"
on public.ai_change_requests for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "ai_change_requests_insert_by_client_role" on public.ai_change_requests;
create policy "ai_change_requests_insert_by_membership"
on public.ai_change_requests for insert
to authenticated
with check (
  requested_by = auth.uid()
  and public.user_can_access_lp(lp_project_id)
);

drop policy if exists "approval_requests_select_by_client_role" on public.approval_requests;
create policy "approval_requests_select_by_membership"
on public.approval_requests for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "preview_deployments_select_by_client_role" on public.preview_deployments;
create policy "preview_deployments_select_by_membership"
on public.preview_deployments for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "git_versions_select_by_client_role" on public.git_versions;
create policy "git_versions_select_by_membership"
on public.git_versions for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "production_deployments_select_by_client_role" on public.production_deployments;
create policy "production_deployments_select_by_membership"
on public.production_deployments for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

drop policy if exists "lp_file_metadata_select_by_client_role" on public.lp_file_metadata;
create policy "lp_file_metadata_select_by_membership"
on public.lp_file_metadata for select
to authenticated
using (public.user_can_access_lp(lp_project_id));

insert into public.access_users (email, full_name, role, is_active)
select
  lower(p.email),
  p.full_name,
  case
    when exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'admin'
        and ur.client_id is null
    ) then 'admin'::public.app_role
    else 'lp_dashboard'::public.app_role
  end,
  true
from public.profiles p
where exists (
  select 1
  from public.user_roles ur
  where ur.user_id = p.id
)
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = true,
  updated_at = now();

insert into public.access_user_lp_projects (access_user_id, lp_project_id)
select
  au.id,
  lp.id
from public.access_users au
join public.user_roles ur
  on ur.role = 'lp_dashboard'
 and ur.client_id is not null
join public.lp_projects lp
  on lp.client_id = ur.client_id
join public.profiles p
  on p.id = ur.user_id
where au.email = lower(coalesce(p.email, ''))
  and au.role = 'lp_dashboard'
on conflict do nothing;

do $$
declare
  profile_row record;
begin
  for profile_row in
    select id, email
    from public.profiles
  loop
    perform public.sync_profile_access(profile_row.id, profile_row.email);
  end loop;
end;
$$;

grant execute on function public.sync_profile_access(uuid, text) to authenticated;
grant execute on function public.sync_profiles_by_access_email(text) to authenticated;
grant execute on function public.user_can_access_lp(uuid) to authenticated;
