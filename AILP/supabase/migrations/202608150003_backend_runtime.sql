create extension if not exists pg_net;
create extension if not exists pg_cron;

create schema if not exists app_private;

revoke all on schema app_private from public;

create table public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  provider text not null default 'google_ga4',
  state_token text not null unique,
  code_verifier text,
  redirect_path text not null,
  requested_scopes text[] not null default '{}'::text[],
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint google_oauth_states_provider check (provider = 'google_ga4')
);

alter table public.google_oauth_states enable row level security;

create policy "google_oauth_states_select_admin_or_owner"
on public.google_oauth_states for select
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
  or (client_id is not null and public.can_access_client(client_id))
);

create policy "google_oauth_states_insert_owner_or_admin"
on public.google_oauth_states for insert
to authenticated
with check (
  public.is_admin()
  or owner_user_id = auth.uid()
);

create policy "google_oauth_states_update_admin_or_owner"
on public.google_oauth_states for update
to authenticated
using (
  public.is_admin()
  or owner_user_id = auth.uid()
)
with check (
  public.is_admin()
  or owner_user_id = auth.uid()
);

create or replace function public.user_can_access_lp(target_lp_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lp_projects lp
    where lp.id = target_lp_project_id
      and public.can_access_client(lp.client_id)
  );
$$;

create or replace function public.enqueue_app_job(
  job_type_input text,
  lp_project_id_input uuid default null,
  ai_change_request_id_input uuid default null,
  requested_payload jsonb default '{}'::jsonb,
  requested_by_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_job_id uuid;
begin
  if requested_by_user_id is null then
    raise exception 'requested_by_user_id is required';
  end if;

  if lp_project_id_input is not null and not public.user_can_access_lp(lp_project_id_input) and not public.is_admin() then
    raise exception 'permission denied for lp_project_id %', lp_project_id_input;
  end if;

  insert into public.app_jobs (
    job_type,
    lp_project_id,
    ai_change_request_id,
    requested_by,
    payload
  )
  values (
    job_type_input,
    lp_project_id_input,
    ai_change_request_id_input,
    requested_by_user_id,
    coalesce(requested_payload, '{}'::jsonb)
  )
  returning id into new_job_id;

  return new_job_id;
end;
$$;

create or replace function app_private.secret_value(secret_name text)
returns text
language sql
stable
security definer
set search_path = vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name;
$$;

create or replace function app_private.project_url()
returns text
language sql
stable
security definer
set search_path = app_private
as $$
  select app_private.secret_value('project_url');
$$;

create or replace function app_private.invoke_edge_function(
  function_name text,
  body jsonb default '{}'::jsonb,
  apikey_secret_name text default 'edge_function_secret_key_default',
  timeout_milliseconds integer default 10000
)
returns bigint
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  project_url text;
  secret_key text;
begin
  project_url := app_private.project_url();
  secret_key := app_private.secret_value(apikey_secret_name);

  if project_url is null then
    raise exception 'Supabase project_url secret is missing';
  end if;

  if secret_key is null then
    raise exception 'Supabase secret key secret % is missing', apikey_secret_name;
  end if;

  return net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', secret_key
    ),
    body := coalesce(body, '{}'::jsonb),
    timeout_milliseconds := timeout_milliseconds
  );
end;
$$;

revoke all on function app_private.secret_value(text) from public;
revoke all on function app_private.project_url() from public;
revoke all on function app_private.invoke_edge_function(text, jsonb, text, integer) from public;

grant execute on function public.enqueue_app_job(text, uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.user_can_access_lp(uuid) to authenticated;
