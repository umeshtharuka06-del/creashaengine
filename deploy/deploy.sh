#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — production deploy / update script (Contabo VPS).
#
#   ./deploy/deploy.sh            # build + (re)start the full stack
#   ./deploy/deploy.sh local-db   # same, plus the optional bundled MongoDB
#
# Idempotent: safe to re-run for every release (e.g. after `git pull`).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

# The compose file interpolates ${VAR} from the default `.env` file, so the
# stack also starts with a bare `docker compose up -d`. Keep secrets in `.env`.
ENV_FILE=".env"
COMPOSE="docker compose"

if [[ "${1:-}" == "local-db" ]]; then
  COMPOSE="${COMPOSE} --profile local-db"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Run:  cp .env.production.example .env  and fill in secrets." >&2
  exit 1
fi

echo "==> Ensuring runtime directories"
# TLS certs + ACME webroot now live in Docker named volumes (letsencrypt /
# certbot-www), not host paths — nothing to create for nginx here.
mkdir -p backups

echo "==> Pulling base images"
# nginx is a locally-built image (royal1-nginx) — not pulled from a registry.
${COMPOSE} pull redis certbot watchtower || true

echo "==> Building application + nginx images"
${COMPOSE} build

echo "==> Validating environment (fail-fast on missing/insecure secrets)"
${COMPOSE} run --rm --no-deps web npm run validate:env

echo "==> Starting / updating the stack"
${COMPOSE} up -d --remove-orphans

echo "==> Pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Current status"
${COMPOSE} ps

cat <<'NOTE'

Deployed. Health endpoints:
  web              http://localhost:3000/api/health   (via nginx: https://$DOMAIN/healthz)
  telegram-worker  http://localhost:4101/health       (inside container)
  deposit-scanner  http://localhost:4102/health        (inside container)
  withdraw-queue   http://localhost:4103/health        (inside container)

First-time TLS setup: run ./deploy/init-letsencrypt.sh
Logs:                 docker compose logs -f web deposit-scanner telegram-worker withdraw-queue
NOTE
