#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — VPS hardening (Ubuntu 24.04). Run as root, once, on the server.
#
#   sudo ./deploy/security/harden.sh
#
# Installs/configures: UFW firewall, Fail2Ban, SSH hardening, unattended
# security upgrades, and ensures Docker starts on boot.
#
# ⚠ SSH hardening disables password login — make sure your SSH PUBLIC KEY is in
#   ~/.ssh/authorized_keys BEFORE running, or you can lock yourself out.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> apt update + install security tooling"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges curl

echo "==> UFW firewall"
bash "${SCRIPT_DIR}/ufw.sh"

echo "==> SSH hardening"
install -D -m 0644 "${SCRIPT_DIR}/sshd_hardening.conf" /etc/ssh/sshd_config.d/99-royal1-hardening.conf
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
else
  echo "!! sshd config test failed — NOT reloading SSH. Review the drop-in." >&2
fi

echo "==> Fail2Ban"
install -D -m 0644 "${SCRIPT_DIR}/fail2ban/jail.local" /etc/fail2ban/jail.local
systemctl enable fail2ban
systemctl restart fail2ban

echo "==> Unattended security upgrades"
install -D -m 0644 "${SCRIPT_DIR}/unattended-upgrades/20auto-upgrades"   /etc/apt/apt.conf.d/20auto-upgrades
install -D -m 0644 "${SCRIPT_DIR}/unattended-upgrades/50unattended-upgrades" /etc/apt/apt.conf.d/50unattended-upgrades
systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

echo "==> Ensure Docker is enabled on boot"
systemctl enable docker 2>/dev/null || true

echo "✓ Hardening complete. Review:  ufw status verbose  |  fail2ban-client status"
