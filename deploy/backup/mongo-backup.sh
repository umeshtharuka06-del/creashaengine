#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — MongoDB backup (works for Atlas and the local Mongo container).
#
# Runs mongodump via a throwaway mongo:7 container attached to the app network,
# streaming a gzipped archive to ./backups, then prunes old archives.
#
#   ./deploy/backup/mongo-backup.sh
#
# Env (from .env.production): DATABASE_URL (required), BACKUP_RETAIN_DAYS (7),
#   BACKUP_DIR (./backups), COMPOSE_NETWORK (default <project>_appnet).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"
[[ -f .env.production ]] && { set -a; . ./.env.production; set +a; }

: "${DATABASE_URL:?DATABASE_URL is required (set it in .env.production)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
NET="${COMPOSE_NETWORK:-$(basename "${ROOT}")_appnet}"

mkdir -p "${BACKUP_DIR}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/royal1-${STAMP}.archive.gz"

echo "==> Dumping to ${OUT}"
# --archive --gzip writes a single gzipped stream to stdout; capture on the host.
docker run --rm --network "${NET}" mongo:7 \
  mongodump --uri="${DATABASE_URL}" --archive --gzip > "${OUT}"

# Fail loudly on an empty/aborted dump.
if [[ ! -s "${OUT}" ]]; then
  echo "!! Backup is empty — removing ${OUT}" >&2
  rm -f "${OUT}"; exit 1
fi

echo "==> Pruning archives older than ${RETAIN_DAYS} days"
find "${BACKUP_DIR}" -name 'royal1-*.archive.gz' -mtime "+${RETAIN_DAYS}" -delete

echo "✓ Backup complete: ${OUT} ($(du -h "${OUT}" | cut -f1))"
