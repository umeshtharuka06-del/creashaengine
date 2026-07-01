#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Seed a temporary self-signed certificate so the :443 server block can bind
# BEFORE Certbot has issued a real certificate. Without this, nginx would crash
# on a fresh deploy ("cannot load certificate ... No such file or directory")
# because royal1.conf references /etc/letsencrypt/live/<domain>/.
#
# Runs from /docker-entrypoint.d/ (the stock nginx entrypoint executes every
# *.sh here, as root, before exec'ing nginx). Certbot later OVERWRITES these
# files in the same letsencrypt volume with the real cert; a reload picks it up.
# ─────────────────────────────────────────────────────────────────────────────
set -e

DOMAIN="${DOMAIN:-mega99.xyz}"
LIVE="/etc/letsencrypt/live/${DOMAIN}"

if [ ! -s "${LIVE}/fullchain.pem" ]; then
  echo "[seed-cert] No certificate for ${DOMAIN}; generating temporary self-signed cert"
  mkdir -p "${LIVE}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "${LIVE}/privkey.pem" \
    -out    "${LIVE}/fullchain.pem" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:www.${DOMAIN}" >/dev/null 2>&1
  echo "[seed-cert] Temporary cert created at ${LIVE} (run deploy/init-letsencrypt.sh for a real one)"
else
  echo "[seed-cert] Certificate already present for ${DOMAIN}; leaving it untouched"
fi
