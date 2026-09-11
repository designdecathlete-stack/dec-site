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
