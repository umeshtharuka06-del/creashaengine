#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — first-time Let's Encrypt bootstrap.
#
# The nginx image already seeds a temporary self-signed cert into the shared
# `letsencrypt` volume on first boot (see nginx/docker-entrypoint.d/), so nginx
# is already running and serving the ACME http-01 challenge on :80. This script
# just replaces that bootstrap cert with a REAL one and reloads nginx.
#
# Certs live in the `letsencrypt` Docker NAMED VOLUME (shared nginx <-> certbot),
# NOT on a host path — this is what makes the stack portable under Portainer.
# Renewals afterwards are automatic (the `certbot` compose service).
#
#   DOMAIN=mega99.xyz CERTBOT_EMAIL=you@example.com ./deploy/init-letsencrypt.sh
#   # or rely on the values in .env
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then set -a; . ./.env; set +a; fi
DOMAIN="${DOMAIN:?Set DOMAIN (e.g. mega99.xyz)}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL}"
STAGING="${STAGING:-0}"   # STAGING=1 to test against Let's Encrypt staging
COMPOSE="docker compose"

# 1) Make sure nginx is up (it self-seeds a bootstrap cert and serves :80 ACME).
echo "==> Ensuring nginx is running (serves the ACME challenge on :80)"
${COMPOSE} up -d nginx

# 2) Request the real certificate via the webroot challenge into the shared volume.
echo "==> Requesting Let's Encrypt certificate for ${DOMAIN} (+ www.${DOMAIN})"
STAGING_FLAG=""; [[ "${STAGING}" == "1" ]] && STAGING_FLAG="--staging"
${COMPOSE} run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  ${STAGING_FLAG} \
  --email "${CERTBOT_EMAIL}" --agree-tos --no-eff-email \
  --force-renewal \
  -d "${DOMAIN}" -d "www.${DOMAIN}"

# 3) Reload nginx so it serves the real certificate.
echo "==> Reloading nginx"
${COMPOSE} exec nginx nginx -s reload

echo "✓ TLS ready for ${DOMAIN}."
