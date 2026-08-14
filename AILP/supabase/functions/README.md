# Supabase Edge Functions

This directory will contain backend API endpoints. Do not put frontend UI code here.

Planned functions:

- `ga4-sync`: fetch GA4 metrics and upsert `ga4_daily_metrics`
- `ai-analyze-lp`: generate LP improvement analysis from GA4 and LP metadata
- `ai-change-request`: create an AI correction request and prepare a future Codex job
- `lp-create-from-template`: create a new LP project request from an existing template LP
- `lp-publish`: approve and publish a generated LP version without changing the public URL
- `job-runner`: process queued `app_jobs`
- `lp-scan-files`: scan LP folder metadata into `lp_file_metadata`
- `notify`: create user/client notifications

Current phase:

- DB schema and API contract only
- no XServer VPS execution yet
- no frontend screen edits
