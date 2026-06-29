#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — MongoDB restore from a mongo-backup.sh archive.
#
#   ./deploy/backup/mongo-restore.sh ./backups/royal1-YYYYMMDD-HHMMSS.archive.gz
#
# ⚠ DESTRUCTIVE: --drop replaces existing collections with the archive's data.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"
[[ -f .env ]] && { set -a; . ./.env; set +a; }

ARCHIVE="${1:-}"
: "${DATABASE_URL:?DATABASE_URL is required}"
[[ -n "${ARCHIVE}" && -s "${ARCHIVE}" ]] || { echo "Usage: $0 <archive.gz>" >&2; exit 1; }
NET="${COMPOSE_NETWORK:-$(basename "${ROOT}")_appnet}"

echo "⚠ This will DROP and replace collections in the target database."
read -r -p "Type 'RESTORE' to continue: " confirm
[[ "${confirm}" == "RESTORE" ]] || { echo "Aborted."; exit 1; }

echo "==> Restoring ${ARCHIVE}"
docker run --rm -i --network "${NET}" mongo:7 \
  mongorestore --uri="${DATABASE_URL}" --archive --gzip --drop < "${ARCHIVE}"

echo "✓ Restore complete."
