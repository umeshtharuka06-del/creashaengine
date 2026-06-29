#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — first-time Let's Encrypt bootstrap (handles the nginx chicken-and-egg).
#
# The :443 server references a certificate + dhparam that don't exist on a fresh
# box, so nginx can't start to serve the ACME challenge. This script:
#   1. generates dhparam.pem,
#   2. installs a temporary self-signed cert so nginx can boot,
#   3. starts nginx, runs certbot webroot to get the REAL cert,
#   4. reloads nginx.
# Renewals afterwards are automatic (the `certbot` compose service).
#
#   DOMAIN=royal1.example.com CERTBOT_EMAIL=you@example.com ./deploy/init-letsencrypt.sh
#   # or rely on the values in .env.production
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.production ]]; then set -a; . ./.env.production; set +a; fi
DOMAIN="${DOMAIN:?Set DOMAIN (e.g. royal1.example.com)}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL}"
STAGING="${STAGING:-0}"   # STAGING=1 to test against Let's Encrypt staging

CONF_DIR="./certbot/conf"
WWW_DIR="./certbot/www"
LIVE_DIR="${CONF_DIR}/live/${DOMAIN}"
COMPOSE="docker compose --env-file .env.production"

mkdir -p "${WWW_DIR}" "${LIVE_DIR}"

# 1) dhparam (referenced by nginx/snippets/ssl-params.conf).
if [[ ! -s "${CONF_DIR}/dhparam.pem" ]]; then
  echo "==> Generating dhparam (2048-bit, ~1 min)"
  openssl dhparam -out "${CONF_DIR}/dhparam.pem" 2048
fi

# 2) Temporary self-signed cert so nginx can start.
if [[ ! -s "${LIVE_DIR}/fullchain.pem" ]]; then
  echo "==> Creating temporary self-signed certificate for ${DOMAIN}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${LIVE_DIR}/privkey.pem" \
    -out "${LIVE_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
fi

echo "==> Starting nginx"
${COMPOSE} up -d nginx

# 3) Replace the dummy cert with a real one via the webroot challenge.
echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"
STAGING_FLAG=""; [[ "${STAGING}" == "1" ]] && STAGING_FLAG="--staging"
rm -rf "${LIVE_DIR}"   # let certbot create the real live dir cleanly
${COMPOSE} run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  ${STAGING_FLAG} \
  --email "${CERTBOT_EMAIL}" --agree-tos --no-eff-email \
  --force-renewal -d "${DOMAIN}"

# 4) Reload nginx with the real certificate.
echo "==> Reloading nginx"
${COMPOSE} exec nginx nginx -s reload

echo "✓ TLS ready for ${DOMAIN}."
