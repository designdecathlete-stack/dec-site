# GA4 Admin Flow

## Current behavior

- The admin screen uses `ga4-property-discovery` to list GA4 web property candidates visible to the configured service account.
- The admin chooses a property from the candidate list and saves it.
- Saving updates:
  - `clients.ga4_property_id`
  - `lp_projects.ga4_page_path`
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
- The current implementation stores the selected property on the client row. This means LPs under the same client share one GA4 property by design.
