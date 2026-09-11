# AILP VPS Worker

This directory contains the worker that will run on the VPS for LP-scoped AI jobs.

The worker is designed around one rule: every job must be scoped to exactly one
`lp_project_id`, and filesystem work must stay inside that LP's workspace.

## First Scope

- Read pending jobs from Supabase.
- Create an isolated workspace per LP.
- Run dry-run AI analysis or file preparation steps.
- Write job steps and debug logs back to Supabase.
- Keep secrets out of AI prompts and logs.

Publishing, GTM injection, and direct production changes are intentionally left
for later phases.

## Local Setup

```powershell
cd D:\Users\natur\Desktop\Python\06_AILP\app\VPS
npm install
Copy-Item .env.example .env
npm run check
npm run worker:once
```

Fill `.env` only on the machine that runs the worker. Do not commit `.env`.

## VPS Layout

Recommended deployment path:

```text
/srv/ailp/worker
/srv/ailp/workspaces
```

Each LP receives a separate workspace:

```text
/srv/ailp/workspaces/{lp_project_id}/
  repo/
  tmp/
  output/
```

The worker validates resolved paths before reading or writing files.

## Required Environment

See `.env.example`.


## Preview folder jobs

`create_preview_folder` creates a copy of one LP under `ailp-previews/{lp-folder}/{version_slug}` on a dedicated branch such as `ailp/marr/draft-xxxxxxxx`. The production LP folder, for example `marr/`, is left unchanged.

Use payload `{ "push": false }` for local VPS verification only. Use `{ "push": true, "version_slug": "ver001" }` after adding a GitHub token or deploy key with write access to the repository. The job records the branch, commit SHA, preview folder path, and preview URL in `lp_jobs`, `lp_job_artifacts`, and `git_versions`.
