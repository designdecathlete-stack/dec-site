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

GA4 authentication has two layers:

- App internal cron/API token: one token for the app to call its own scheduled APIs
- Google GA4 connection token: one connection per owner/client/account as needed

The cron/API token is app-level. It is not the same as the owner's Google token.

For GA4, support both patterns:

- `service_account`: one backend service account can read multiple GA4 properties if each property grants it Viewer access
- `oauth2`: an owner signs in with Google and grants Analytics read access; the app stores token references per connection

Use `integration_connections` for each connected Google/GA4 account. Store only metadata and Vault/secret names in the database. Do not store access or refresh token values in normal tables.

Project/client mapping is still per client and per LP:

- `clients.ga4_property_id`: GA4 property used for that client/project
- `ga4_property_connections`: maps a client to a GA4 property and the Google connection used to access it
- `lp_projects.ga4_page_path`: page path used to filter that LP inside the property

If all LPs are measured in one GA4 property, multiple clients can share the same `ga4_property_id` and differ by `ga4_page_path`.

If each client has a separate GA4 property, set a different `ga4_property_id` on each `clients` row.

If each owner authenticates their own Google account, create one `integration_connections` row per owner connection and link it to the client's GA4 property through `ga4_property_connections`.

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
