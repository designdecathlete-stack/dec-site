# Auth / GA4 Backend Plan

## Scope

This phase builds the backend contract only. Do not change `AILP/front` screen code until the frontend owner is ready to wire it.

## Login

Use Supabase Auth with Google as the only sign-in provider.

Required Supabase dashboard settings:

- Authentication > Providers > Google: enabled
- Google OAuth client ID / secret: configured in Supabase
- Site URL: production app URL
- Redirect URLs: local dev URL and production app URL

The database migration creates `profiles` from `auth.users` with a trigger. App access is controlled by `user_roles`.

Roles:

- `admin`: can view/manage all clients, LPs, GA4 metrics, AI analysis, and AI change requests
- `lp_dashboard`: can view only rows linked to their assigned `client_id`

## GA4 Data Model

GA4 data is stored per LP, not just per client.

Mapping:

```text
clients
  -> lp_projects
      folder_path: chacha
      public_url: https://dec-site.site/chacha/
      ga4_page_path: /chacha/
      -> ga4_daily_metrics
```

The frontend can query:

- clients available to the signed-in user
- LPs under each client
- daily metrics by LP and date range
- AI analysis and change requests for each LP

## GA4 Sync

The first GA4 sync implementation should be an Edge Function or server API that:

1. Reads active `lp_projects`
2. Uses each LP's `ga4_page_path`
3. Calls GA4 Data API
4. Upserts rows into `ga4_daily_metrics`
5. Writes each run into `ga4_sync_jobs`

Future scheduled execution options:

- Supabase Scheduled Edge Function
- external cron hitting a Supabase Edge Function
- XServer VPS cron when the Codex execution machine is introduced

For scheduled execution, store function invocation secrets in Supabase Vault or Edge Function secrets. Do not store secret values in application tables.

## Frontend Contract

Frontend should not hard-code LP data once connected. It should read:

```sql
clients
lp_projects
ga4_daily_metrics
ai_analysis_results
ai_change_requests
```

RLS policies ensure admins see all rows and clients see only their own rows.
