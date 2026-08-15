# Supabase Edge Functions

This directory contains backend API endpoints for `ailp-management`.
Do not put frontend UI code here.

## Implemented in this phase

- `ga4-sync`
  - manual or cron-triggered GA4 sync
  - reads `lp_projects` and `clients.ga4_property_id`
  - writes `ga4_sync_jobs` and `ga4_daily_metrics`
  - current implementation uses `GOOGLE_SERVICE_ACCOUNT_JSON`
- `lp-create-from-template`
  - creates a draft `lp_projects` row
  - creates the initial `ai_change_requests` row
  - enqueues an `app_jobs` record
- `ai-change-request`
  - creates a user-requested AI modification request
  - saves `before_commit_sha` if present
  - enqueues an `app_jobs` record
- `lp-publish`
  - creates an `approval_requests` row
  - updates `ai_change_requests.status`
  - enqueues an `app_jobs` record when approved

## Shared helpers

- `_shared/env.ts`: environment variable parsing
- `_shared/http.ts`: JSON response helpers
- `_shared/supabase.ts`: user/service Supabase clients
- `_shared/ga4.ts`: Google service account auth and GA4 Data API access

## Current phase limits

- Google login itself is handled by Supabase Auth provider settings
- owner-driven GA4 OAuth token persistence is not wired yet
- no XServer VPS / Codex execution yet
- no frontend screen edits
