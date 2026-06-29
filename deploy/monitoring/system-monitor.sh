#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — system monitor. Checks CPU load, memory, disk, and Docker container
# health; logs a structured line and (optionally) sends a Telegram alert when a
# threshold is breached or a container is unhealthy.
#
# Thresholds / alerting are configured via env (see .env.production):
#   CPU_MAX (default 90)  MEM_MAX (90)  DISK_MAX (85)
#   MONITOR_TELEGRAM_BOT_TOKEN / MONITOR_TELEGRAM_CHAT_ID  (optional alerts)
#
# Run from cron or the bundled systemd timer (every 5 min).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Load deployment env if present (for thresholds + alert creds).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -f "${ROOT}/.env" ]] && { set -a; . "${ROOT}/.env"; set +a; }

CPU_MAX=${CPU_MAX:-90}
MEM_MAX=${MEM_MAX:-90}
DISK_MAX=${DISK_MAX:-85}

LOG_DIR=${MONITOR_LOG_DIR:-/var/log/royal1}
mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/monitor.log"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# CPU: 1-min load average as a percentage of available cores.
cores=$(nproc)
load1=$(awk '{print $1}' /proc/loadavg)
cpu_pct=$(awk -v l="${load1}" -v c="${cores}" 'BEGIN{printf "%.0f", (l/c)*100}')

# Memory: used / total %.
mem_pct=$(free | awk '/^Mem:/{printf "%.0f", ($2-$7)/$2*100}')

# Disk: root filesystem used %.
disk_pct=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')

# Unhealthy containers (if Docker is present).
unhealthy=""
if command -v docker >/dev/null 2>&1; then
  unhealthy=$(docker ps --filter health=unhealthy --format '{{.Names}}' | paste -sd, -)
fi

alerts=()
(( cpu_pct  > CPU_MAX ))  && alerts+=("CPU ${cpu_pct}% > ${CPU_MAX}%")
(( mem_pct  > MEM_MAX ))  && alerts+=("MEM ${mem_pct}% > ${MEM_MAX}%")
(( disk_pct > DISK_MAX )) && alerts+=("DISK ${disk_pct}% > ${DISK_MAX}%")
[[ -n "${unhealthy}" ]]   && alerts+=("UNHEALTHY: ${unhealthy}")

status="ok"; (( ${#alerts[@]} > 0 )) && status="alert"

printf '%s level=%s cpu=%s%% mem=%s%% disk=%s%% unhealthy=%s\n' \
  "$(ts)" "${status}" "${cpu_pct}" "${mem_pct}" "${disk_pct}" "${unhealthy:-none}" >> "${LOG}"

# Optional Telegram alert.
if (( ${#alerts[@]} > 0 )) && [[ -n "${MONITOR_TELEGRAM_BOT_TOKEN:-}" && -n "${MONITOR_TELEGRAM_CHAT_ID:-}" ]]; then
  msg="⚠️ Royal1 $(hostname): $(IFS='; '; echo "${alerts[*]}")"
  curl -fsS --max-time 8 \
    "https://api.telegram.org/bot${MONITOR_TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${MONITOR_TELEGRAM_CHAT_ID}" --data-urlencode text="${msg}" >/dev/null 2>&1 || true
fi

(( ${#alerts[@]} > 0 )) && exit 1 || exit 0
