#!/usr/bin/env bash
# One-shot Hostinger deploy (Part 4 quick playtest path).
# Usage: ./deploy/hostinger-up.sh [root@IP]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS="${1:-root@179.236.68.191}"
cd "$ROOT"

echo "==> Ensuring remote folders / Node / service exist on $VPS"
ssh -o ConnectTimeout=20 "$VPS" bash -s <<'REMOTE'
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  apt update
  apt install -y nginx ufw rsync sqlite3 curl
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt install -y nodejs
fi
id ouroboros >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin ouroboros
mkdir -p /opt/0uroboros/server/dist/server /var/lib/0uroboros /var/www/0uroboros/site /etc/0uroboros
chown -R ouroboros:ouroboros /opt/0uroboros /var/lib/0uroboros
if [ ! -f /etc/0uroboros/server.env ]; then
  cat >/etc/0uroboros/server.env <<'ENV'
PORT=8787
HOST=0.0.0.0
OUROBOROS_DB=/var/lib/0uroboros/ouroboros.sqlite
OUROBOROS_TRUST_PROXY=off
ENV
  chmod 600 /etc/0uroboros/server.env
fi
if [ ! -f /etc/systemd/system/0uroboros.service ]; then
  cat >/etc/systemd/system/0uroboros.service <<'UNIT'
[Unit]
Description=0uroboros game server
After=network.target

[Service]
User=ouroboros
WorkingDirectory=/opt/0uroboros/server
EnvironmentFile=/etc/0uroboros/server.env
ExecStart=/usr/bin/node dist/server/main.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable 0uroboros
fi
# ws + zod next to the bundle (idempotent)
if [ ! -d /opt/0uroboros/server/node_modules/ws ]; then
  cd /opt/0uroboros/server
  sudo -u ouroboros npm init -y >/dev/null
  sudo -u ouroboros npm install --omit=dev ws@8.22.0 zod@4.6.5
fi
# nginx root → site (best-effort)
if [ -f /etc/nginx/sites-available/default ]; then
  sed -i 's#root /var/www/html;#root /var/www/0uroboros/site;#' /etc/nginx/sites-available/default || true
  nginx -t && systemctl reload nginx || true
fi
# firewall: ssh + http + game port
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80 || true
  ufw allow 8787 || true
  ufw --force enable || true
fi
REMOTE

echo "==> Uploading server + site"
rsync -av --delete "$ROOT/dist/server/" "$VPS:/opt/0uroboros/server/dist/server/"
rsync -av --delete "$ROOT/dist/site/" "$VPS:/var/www/0uroboros/site/"
ssh "$VPS" "chown -R ouroboros:ouroboros /opt/0uroboros/server && systemctl restart 0uroboros && sleep 1 && systemctl is-active 0uroboros && curl -fsS http://127.0.0.1:8787/healthz"

IP="${VPS#*@}"
echo
echo "Deployed."
echo "  Site:   http://$IP/"
echo "  Health: http://$IP:8787/healthz"
