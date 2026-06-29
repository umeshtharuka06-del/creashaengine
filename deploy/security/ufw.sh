#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UFW firewall — deny everything inbound except SSH + HTTP(S).
# Only Nginx (80/443) and SSH (22) are reachable; all container ports stay
# internal to the Docker bridge.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH. To restrict to a known admin IP instead, replace with:
#   ufw allow from <YOUR_IP> to any port 22 proto tcp
ufw allow 22/tcp comment 'SSH'

# Web. Optionally restrict origin pulls to Cloudflare only by allowing just the
# Cloudflare ranges (see nginx/snippets/cloudflare-realip.conf) instead of all.
ufw allow 80/tcp  comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Docker manages its own iptables for published ports; keep UFW from interfering.
ufw --force enable
ufw status verbose
