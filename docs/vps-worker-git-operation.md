# AILP VPS worker Git operation notes

## Git identity

Use `hd-fluxion` as the Git author for AILP worker commits.

- `GIT_AUTHOR_NAME=hd-fluxion`
- `GIT_AUTHOR_EMAIL=h.dazai0316@gmail.com`

The local repository is also configured with this identity. The VPS worker sets the same identity inside each LP workspace before creating draft or preview commits.

## GitHub connection

The VPS worker uses a GitHub Deploy Key registered on `designdecathlete-stack/dec-site` with write access enabled.

- Private key on VPS: `/home/ailp-worker/.ssh/ailp_dec_site_deploy`
- Public key copy on local PC: `D:\Users\natur\Desktop\Python\06_AILP\ailp_dec_site_deploy.pub`
- Worker repository URL: `git@github.com:designdecathlete-stack/dec-site.git`

The private key must stay on the VPS. Only the public key is shared with GitHub or the client.

## Current safe publishing policy

The worker may push draft or preview branches such as:

```text
ailp/marr/draft-xxxxxxxx
```

The worker must not change production `/marr/` or push to `main` during the current verification phase. Approval currently means updating the draft side only. A separate publish flow will be needed before copying a draft back to `/marr/` and merging to `main`.

## Verified branch push

The Deploy Key push was verified with this branch:

```text
ailp/marr/draft-4389fa82
```

The branch contains the preview folder:

```text
ailp-previews/marr/draft-4389fa82/
```

The production URL `https://dec-site.netlify.app/ailp-previews/marr/draft-4389fa82/` returned 404 because this folder is on a draft branch, not `main`. To view it publicly before merge, use Netlify Deploy Preview or Branch Deploy.

## Draft apply flow

`apply_to_draft` converts the latest LP-scoped AI analysis into a draft-only LP update. It copies the production LP folder into `ailp-previews/{lp-folder}/{version_slug}`, injects a draft improvement section into the copied `index.html`, commits the result on a branch such as `ailp/marr/draft-xxxxxxxx`, and pushes the branch when the job payload does not set `push: false`.

This job intentionally leaves the production LP folder, for example `marr/`, and `main` unchanged. During the current verification phase, approval means updating the draft side only.

Verified test job:

```text
job: d23613be-3c76-4b14-8428-dfa053f0927a
branch: ailp/marr/draft-d23613be
commit: ab5ec9e487cc068b22c3f685c4ea5fec28082382
folder: ailp-previews/marr/draft-d23613be/
```

The saved `preview_url` still uses the production Netlify domain as a placeholder until Netlify Deploy Preview or Branch Deploy is configured. The job metadata stores `netlify_preview_status=pending_netlify_deploy_preview` and the GitHub branch URL for review.
