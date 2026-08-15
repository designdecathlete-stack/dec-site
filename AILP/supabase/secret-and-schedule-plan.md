# Secret and Schedule Plan

## Secret Storage

Never store real secrets in Git or frontend environment variables.

Use two storage locations depending on how the secret is used.

```text
Supabase Edge Function Secrets
  Used by Edge Functions through Deno.env.get(...)
  Good for GA4 service account JSON, OpenAI API key, GitHub token, Netlify build hook URL.

Supabase Vault
  Used by SQL, database functions, cron jobs, and pg_net requests.
  Good for project URL, function auth token, webhook token used from SQL.
```

The database table `integration_secret_refs` stores only metadata:

```text
provider
purpose
storage_type
secret_name
description
```

It must not store secret values.

## Token Types

Do not treat all tokens as one thing.

```text
App cron/API token
  One internal token for scheduled jobs to call AILP Edge Functions.
  Stored in Vault or Edge Function secrets.

Owner Google OAuth token
  Per owner/client Google connection.
  Used to read GA4 properties the owner granted access to.
  Store token values in Vault/secret storage, and store only references in `integration_connections`.

Service account credential
  Optional backend-owned credential for GA4.
  Works when each GA4 property grants the service account Viewer access.
```

Future owner growth is handled by creating more `integration_connections` rows, not by creating a new app.

## Required Secrets

Planned Edge Function secrets:

```text
GA4_PROPERTY_ID
GOOGLE_SERVICE_ACCOUNT_JSON
OPENAI_API_KEY
GITHUB_TOKEN
NETLIFY_BUILD_HOOK_URL
```

`GA4_PROPERTY_ID` is optional when `clients.ga4_property_id` is set per client. Keep it only as a default/fallback property ID.

Planned Vault secrets for scheduled execution:

```text
project_url
edge_function_token
```

Planned per-owner OAuth secret names should be generated per connection, for example:

```text
ga4_oauth_access_token_<connection_id>
ga4_oauth_refresh_token_<connection_id>
```

Supabase official docs say Edge Functions can read project secrets as environment variables, and production secrets can be set through the Dashboard or CLI with `supabase secrets set`.

Supabase scheduled functions can use Postgres Cron with `pg_net`; Supabase recommends storing the auth token securely in Vault when invoking an Edge Function on a schedule.

## User Roles

Use only two product roles.

```text
admin
  Can access management pages.
  Can manage users, clients, LP projects, GA4 sync, AI analysis, AI correction requests, publishing.

lp_dashboard
  Can access only assigned client's LP dashboard.
  Can view assigned clients, LPs, GA4 metrics, AI analysis, and AI correction request status.
  Cannot manage other users, clients, secrets, schedules, or global settings.
```

DB table:

```text
user_roles
  user_id
  role
  client_id
```

Rules:

- `admin` rows must have `client_id = null`
- `lp_dashboard` rows must have `client_id`

## Scheduled GA4 Sync

Preferred final flow:

```text
Supabase Cron
  -> pg_net HTTP POST
  -> /functions/v1/ga4-sync
  -> ga4_sync_jobs
  -> ga4_daily_metrics
```

Example schedule:

```text
Daily 03:00 Japan time
```

Supabase Cron generally uses cron syntax. Final timezone handling should be checked when configuring the actual project.

## Initial Manual Settings

These are one-time setup tasks in dashboards:

1. Google Cloud OAuth Client ID/Secret
2. Supabase Auth Google provider
3. GA4 Data API enabled
4. GA4 property access for service account
5. Supabase Edge Function secrets
6. Supabase Vault secrets for scheduled invocation
7. Supabase Cron job
