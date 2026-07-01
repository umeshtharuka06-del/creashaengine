# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — production image (Next.js web + the long-running workers share one
# image; the running command differs per docker-compose service).
#
# Multi-stage:
#   base       → runtime OS + tini/openssl/curl
#   prod-deps  → production node_modules only (incl. tsx + prisma CLI), slim
#   build-deps → full node_modules (adds tailwind/typescript/@types for the build)
#   builder    → `next build`
#   runner     → final slim image = prod-deps node_modules + built .next
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]

# ── Production dependencies only (smallest runtime node_modules) ─────────────
# tsx (runs the workers) and prisma (generate/migrate) are runtime deps, so
# --omit=dev still includes them; tailwind/typescript/@types are excluded.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --omit=dev --no-audit --no-fund

# ── Full dependencies (build only) ──────────────────────────────────────────
FROM base AS build-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ── Build the Next.js production bundle ─────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Final runtime image ─────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Slim production node_modules (no build-only packages).
COPY --from=prod-deps /app/node_modules ./node_modules
# Built app + everything the web server and tsx workers need at runtime.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts

USER nextjs
EXPOSE 3000
# Graceful shutdown: tini (ENTRYPOINT) forwards SIGTERM; web + workers drain.
STOPSIGNAL SIGTERM
# Default command runs the web server. Workers override `command:` in compose.
CMD ["npm", "run", "start"]
