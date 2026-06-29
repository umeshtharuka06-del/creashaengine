# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — self-contained Nginx origin image.
#
# WHY THIS EXISTS
#   The reverse-proxy config (conf.d + snippets) is COPYed INTO the image instead
#   of bind-mounted from the host. Relative bind mounts of ./nginx/conf.d break
#   under Portainer: Git/Web-editor stacks do NOT reproduce the repo layout on the
#   Docker host, so the daemon resolves `./nginx/conf.d` to a non-existent path and
#   SILENTLY mounts an empty auto-created directory → no server blocks → the site
#   is unreachable even though `nginx -t` passes. Baking the config in makes the
#   proxy behave identically no matter how the stack is deployed.
#
#   openssl is kept so the entrypoint hook can seed a temporary self-signed cert
#   into the letsencrypt volume, letting the :443 server bind before Certbot has
#   issued a real certificate (the classic nginx <-> Certbot chicken-and-egg).
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

# Reverse-proxy configuration — BAKED IN, never bind-mounted.
COPY conf.d/   /etc/nginx/conf.d/
COPY snippets/ /etc/nginx/snippets/

# Self-signed bootstrap cert seeder (runs before nginx starts).
COPY docker-entrypoint.d/10-seed-selfsigned-cert.sh /docker-entrypoint.d/10-seed-selfsigned-cert.sh
RUN chmod +x /docker-entrypoint.d/10-seed-selfsigned-cert.sh

# Domain used by the seeder + referenced cert paths in royal1.conf.
ENV DOMAIN=mega99.xyz

EXPOSE 80 443
