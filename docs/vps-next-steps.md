## VPS phase next steps

Current status:

- Dashboard, GA4 sync status, API logs, AI analysis display, and LP version display are handled in the frontend and Supabase.
- Actual file duplication, branch creation, commit generation, rollback execution, and production swap are not connected yet.

### Required after VPS is ready

1. Codex execution worker
- Read LP folders from the repository
- Duplicate template or current LP folder
- Apply AI change requests to files
- Commit to a branch and store commit metadata in Supabase

2. Publish executor
- Build preview artifact
- Issue preview deploy
- Promote approved version to production
- Mark old live version as replaced

3. Rollback executor
- Select previous live commit
- Rebuild and redeploy
- Update `git_versions` and `production_deployments`

### Supabase tables already prepared

- `git_versions`
- `preview_deployments`
- `production_deployments`
- `approval_requests`
- `app_jobs`
- `ai_change_requests`

### UI behavior before VPS connection

- `公開する` and `ロールバック` stay as placeholder actions
- `新バージョンを作成` stays as a placeholder action
- Version and history screens are display-first
