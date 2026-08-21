create or replace function app_private.invoke_internal_edge_function(
  function_name text,
  body jsonb default '{}'::jsonb,
  apikey_secret_name text default 'edge_function_secret_key_default',
  cron_token_secret_name text default 'app_internal_cron_token',
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
  cron_token text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into secret_key
  from vault.decrypted_secrets
  where name = apikey_secret_name
  limit 1;

  select decrypted_secret into cron_token
  from vault.decrypted_secrets
  where name = cron_token_secret_name
  limit 1;

  if project_url is null then
    raise exception 'Supabase project_url secret is missing';
  end if;

  if secret_key is null then
    raise exception 'Supabase secret key secret % is missing', apikey_secret_name;
  end if;

  if cron_token is null then
    raise exception 'Cron token secret % is missing', cron_token_secret_name;
  end if;

  return net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', secret_key,
      'x-internal-cron-token', cron_token
    ),
    body := coalesce(body, '{}'::jsonb),
    timeout_milliseconds := timeout_milliseconds
  );
end;
$$;

create or replace function public.trigger_daily_ga4_sync()
returns bigint
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  sync_date_jst date;
begin
  sync_date_jst := (timezone('Asia/Tokyo', now()))::date - 1;

  return app_private.invoke_internal_edge_function(
    function_name := 'ga4-sync',
    body := jsonb_build_object(
      'date_from', sync_date_jst::text,
      'date_to', sync_date_jst::text
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

create or replace function public.ensure_daily_ga4_sync_job(
  job_name text default 'ailp-ga4-daily-sync',
  schedule text default '0 18 * * *'
)
returns bigint
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  perform cron.unschedule(job_name)
  where exists (
    select 1
    from cron.job
    where cron.job.jobname = job_name
  );

  return cron.schedule(
    job_name,
    schedule,
    'select public.trigger_daily_ga4_sync();'
  );
end;
$$;

grant execute on function public.trigger_daily_ga4_sync() to authenticated;
grant execute on function public.ensure_daily_ga4_sync_job(text, text) to authenticated;

revoke all on function app_private.invoke_internal_edge_function(text, jsonb, text, text, integer) from public;
