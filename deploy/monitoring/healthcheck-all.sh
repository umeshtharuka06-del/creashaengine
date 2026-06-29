#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — at-a-glance health of every container. Prints each service's Docker
# health status and probes the in-container health endpoints. Exit 1 if any
# service is not healthy.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

services=(royal1-web royal1-telegram-worker royal1-deposit-scanner royal1-withdraw-queue royal1-engine royal1-redis royal1-nginx)
rc=0

printf '%-28s %-12s\n' "CONTAINER" "HEALTH"
for c in "${services[@]}"; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    printf '%-28s %-12s\n' "$c" "absent"; rc=1; continue
  fi
  h=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null)
  printf '%-28s %-12s\n' "$c" "${h}"
  [[ "$h" == "healthy" || "$h" == "running" ]] || rc=1
done

echo
echo "Web endpoint (via web container):"
docker exec royal1-web curl -fsS http://localhost:3000/api/health 2>/dev/null && echo || { echo "  unreachable"; rc=1; }

exit $rc
