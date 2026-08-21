## GA4 daily cron setup

Project: `ailp-manager`
Project URL: `https://mgawpujvandftyslmnxf.supabase.co`

### 1. Register Vault secrets

Run this in the Supabase SQL Editor.

```sql
select vault.create_secret(
  'https://mgawpujvandftyslmnxf.supabase.co',
  'project_url'
);

select vault.create_secret(
  'sb_publishable_2DsoZRHEzJl14DFSCxHslQ_4gjQvigo',
  'edge_function_secret_key_default'
);

select vault.create_secret(
  '4FF1ACB5660026A0D4BF0036E2B987CC8CC8165340A9DEC23357C82784928ACB',
  'app_internal_cron_token'
);
```

### 2. Verify the secrets exist

```sql
select name
from vault.decrypted_secrets
where name in (
  'project_url',
  'edge_function_secret_key_default',
  'app_internal_cron_token'
)
order by name;
```

Expected: 3 rows.

### 3. Create the daily GA4 cron job

This schedules GA4 sync once per day at `18:00 UTC` = `03:00 JST`.
The target date is always `yesterday` in JST.

If `app_private.project_url() does not exist` appears, run this fix first:

```sql
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
```

```sql
select public.ensure_daily_ga4_sync_job();
```

### 4. Verify the cron job

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'ailp-ga4-daily-sync';
```

Expected:

- `jobname = ailp-ga4-daily-sync`
- `schedule = 0 18 * * *`
- `active = true`

### 5. Run one manual test now

```sql
select public.trigger_daily_ga4_sync();
```

This requests GA4 sync for JST yesterday.

### 6. Check whether the request finished

```sql
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 5;
```

Expected:

- `status_code = 200`
- `error_msg` is `null`

### 7. Check GA4 sync job history

```sql
select
  started_at,
  completed_at,
  status,
  date_from,
  date_to,
  summary
from public.ga4_sync_jobs
order by started_at desc
limit 10;
```

Expected:

- latest row has `status = success`
- `date_from` and `date_to` match JST yesterday

### Notes

- Current setup assumes one GA4 property is enough for now.
- `ga4-sync` already exists as an active Edge Function.
- If Vault secrets were created once already, do not create duplicates. Check first.
