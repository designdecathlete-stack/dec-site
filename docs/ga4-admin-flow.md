# GA4 Admin Flow

## Current behavior

- The admin screen uses `ga4-property-discovery` to list GA4 web property candidates visible to the configured service account.
- The admin chooses a property from the candidate list and saves it.
- Saving upserts one `lp_analytics_settings` row per LP, including Property ID,
  Page Path, optional Measurement ID / GTM Container ID, and `is_active`.
- After saving, the admin runs one action: `接続テスト兼取得`.
- That action calls `ga4-sync` for the last 7 days and stores results in:
  - `ga4_sync_jobs`
  - `ga4_daily_metrics`

## Why candidate selection is manual

- GA4 Admin API can list accounts, properties, and web streams.
- Web streams expose `default_uri`, but that is not enough to safely determine the correct LP in all cases.
- Final property selection stays with the admin to avoid binding the wrong GA4 property.

## Expected admin steps

1. Open `GA4確認`
2. Click `候補取得`
3. Select the correct GA4 property
4. Confirm or edit `Page Path`
5. Click `保存`
6. Click `接続テスト兼取得`

## Notes

- `Page Path` defaults to `/{folder_path}/` when the LP row has no explicit `ga4_page_path`.
- LP settings take precedence per field; null/blank Property ID or Page Path falls
  back to `clients.ga4_property_id` / `lp_projects.ga4_page_path`. Saving never
  changes these legacy fields or other LPs belonging to the same client.
- `is_active=false` disables synchronization even when legacy fallback exists.
  Missing property/path and inactive settings return `skipped`, persist a `failed`
  sync job (compatible with the existing status enum), and log `target_skipped`.
- Candidate discovery still uses the service account and returns effective
  `analytics_settings`. Selecting a web stream also fills its Measurement ID.
- GTM is metadata only: it can remain empty; no tag injection or VPS work is added.

## LP settings rollout (2026-09-05)

- Target Supabase project: **ailp-manager** (`mgawpujvandftyslmnxf`). Apply
  `20260904235444_lp_analytics_settings.sql` before deploying the two GA4 Edge
  Functions (include `_shared/analytics-settings.ts`) and the frontend.
- Backfill copies existing LP/client values, including marr, without changing
  legacy settings. The migration adds the requested `current_user_is_admin()`
  and `lp_user_memberships` compatibility names when absent; they delegate to
  existing `is_admin()` and `lp_project_memberships`, without copying memberships.
- Administrators can perform CRUD; `lp_dashboard` members can only read settings
  for participating LPs. The compatibility and dashboard views use security invoker.
- Dashboard migration preserves installed column order and reporting expressions
  (including environments with/without `lp_description`), replaces GA4 references,
  and appends `ga4_measurement_id`, `gtm_container_id`, `ga4_is_active`.
- Run `npm run build` from `app`. The four previously missing CSS files are now
  copied to `dist/ailp-management/`; existing public URLs and LP folders are unchanged.

### Verification

- `npm run build`, JavaScript/TypeScript syntax checks with Node 24, and
  `node scripts/test-analytics-settings.mjs` passed (all 29 local CSS files match).
- Executed migration + `AILP/supabase/tests/lp_analytics_settings.sql` in one
  transaction on ailp-manager and rolled back: admin CRUD, member read-only,
  same-client nonmember isolation, anonymous denial, LP overrides/fallback, and
  inactive status passed. Marr retained `550041717` / `/marr/` and its metrics.
- These checks do not deploy the migration or functions and do not call Google.
  After rollout, verify service-account candidate discovery, save two LPs of one
  client independently, sync marr, and check metrics / API logs / AI analysis /
  version history at the unchanged `/ailp-management/` path.
