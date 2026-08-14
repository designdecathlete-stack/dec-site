# Operations Workflow Plan

## Purpose

This document covers backend state that the mock frontend already implies but the backend must own.

## Added Backend Areas

### Job Queue

Table:

```text
app_jobs
```

Used for long-running or retryable work:

- GA4 sync
- AI analysis
- AI correction request
- LP template creation
- Git branch/file operation
- Netlify preview or production deploy

Jobs should be idempotent. Failed jobs can be retried until `max_attempts`.

### Approval Flow

Table:

```text
approval_requests
```

Flow:

```text
draft
  -> pending
  -> approved / rejected
  -> published
```

The final publish step must keep `lp_projects.public_url` unchanged.

### Preview Deployments

Table:

```text
preview_deployments
```

Stores Netlify Deploy Preview or future preview URLs created from an AI correction branch.

### Git Versions

Table:

```text
git_versions
```

Stores commit SHAs and branch names so an LP can be rolled back.

Important fields:

- `commit_sha`
- `parent_commit_sha`
- `folder_path`
- `is_production`

### Production Deployments

Table:

```text
production_deployments
```

Tracks Netlify production deploys and rollback targets.

### LP File Metadata

Table:

```text
lp_file_metadata
```

Stores scanned metadata about LP files:

- HTML files
- CSS files
- JS files
- images
- GTM/CV related files
- checksums

This is metadata only. The file source of truth remains Git.

### Notifications

Table:

```text
notifications
```

Used for:

- GA4 sync failed
- AI analysis completed
- preview ready
- approval requested
- production published

### Audit Logs

Table:

```text
audit_logs
```

Records:

- who acted
- what action happened
- which entity changed
- before/after data
- metadata

Audit logs are admin-only.

## Relationship to Frontend

The frontend already has UI concepts for these operations, but the current app is mock-only. These tables provide the backend contract for those screens without editing `AILP/front`.
