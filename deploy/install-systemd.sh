#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — install the systemd units (boot startup, monitoring, backups).
# Run as root. Assumes the repo is deployed at /opt/royal1 (edit APP_DIR below
# and the WorkingDirectory in the unit files if you deploy elsewhere).
#
#   sudo ./deploy/install-systemd.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

APP_DIR="${APP_DIR:-/opt/royal1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing unit files"
install -m 0644 "${SCRIPT_DIR}/systemd/royal1.service"            /etc/systemd/system/royal1.service
install -m 0644 "${SCRIPT_DIR}/monitoring/royal1-monitor.service" /etc/systemd/system/royal1-monitor.service
install -m 0644 "${SCRIPT_DIR}/monitoring/royal1-monitor.timer"   /etc/systemd/system/royal1-monitor.timer
install -m 0644 "${SCRIPT_DIR}/backup/royal1-backup.service"      /etc/systemd/system/royal1-backup.service
install -m 0644 "${SCRIPT_DIR}/backup/royal1-backup.timer"        /etc/systemd/system/royal1-backup.timer

# Ensure the deploy scripts are executable.
chmod +x "${SCRIPT_DIR}"/*.sh "${SCRIPT_DIR}"/security/*.sh "${SCRIPT_DIR}"/monitoring/*.sh "${SCRIPT_DIR}"/backup/*.sh 2>/dev/null || true

echo "==> Reloading systemd"
systemctl daemon-reload

echo "==> Enabling units"
systemctl enable royal1.service
systemctl enable --now royal1-monitor.timer
systemctl enable --now royal1-backup.timer

echo "✓ Installed. Start the stack now with:  systemctl start royal1.service"
echo "  (App dir assumed at ${APP_DIR}; adjust WorkingDirectory in the units if different.)"
