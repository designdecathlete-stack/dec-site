#!/usr/bin/env bash
set -euo pipefail

sudo useradd --system --create-home --shell /usr/sbin/nologin ailp-worker || true
sudo mkdir -p /srv/ailp/worker /srv/ailp/workspaces
sudo chown -R ailp-worker:ailp-worker /srv/ailp
sudo chmod 750 /srv/ailp /srv/ailp/workspaces

echo "Created ailp-worker user and /srv/ailp directories."

