#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Background reloader so nginx picks up a NEW certificate without a container
# restart. Certbot (a separate container) cannot signal this nginx process
# directly, so the two communicate through the shared `letsencrypt` volume:
# Certbot drops a marker file after issuing/renewing a cert, and this loop
# reloads nginx when it sees it (and also every 6h as a safety net for renewals).
#
# This runs from /docker-entrypoint.d/ (executed by the stock nginx entrypoint
# before it exec's nginx). We background the loop and return immediately; the
# backgrounded child survives the parent's exec and keeps running alongside
# nginx for the life of the container.
# ─────────────────────────────────────────────────────────────────────────────
set -e

SIGNAL="/etc/letsencrypt/.reload"

(
  ticks=0
  while :; do
    sleep 60
    ticks=$((ticks + 1))
    # Reload when Certbot signals a cert change, or every 6h (360 ticks) anyway.
    if [ -f "$SIGNAL" ] || [ "$ticks" -ge 360 ]; then
      # Only reload if the config still tests clean, so a transient bad state
      # never takes the running server down (reload keeps old workers on error).
      if nginx -t >/dev/null 2>&1; then
        nginx -s reload 2>/dev/null || true
      fi
      rm -f "$SIGNAL" 2>/dev/null || true
      ticks=0
    fi
  done
) &

echo "[reload-loop] watching ${SIGNAL} (and reloading every 6h for renewals)"
