# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Royal 1 — production image (Next.js web + standalone workers share one image;
# the running command differs per docker-compose service).
# ─────────────────────────────────────────────────────────────────────────────

# Base: Node LTS on Debian (bookworm). openssl is required by the Prisma query
# engine; tini provides correct PID-1 signal handling for graceful shutdown;
# curl is used by the container healthchecks.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]

# ── deps: install ALL dependencies (incl. dev — needed for `next build`, the
#    Prisma CLI, and `tsx` which runs the workers in production). The prisma
#    schema is copied first so the `postinstall` prisma generate succeeds.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ── builder: compile the Next.js production build.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runner: the final runtime image.
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# Non-root runtime user.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/node_modules ./node_modules
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
# Graceful shutdown: tini (ENTRYPOINT) forwards SIGTERM to Node; web + workers
# all install SIGTERM/SIGINT handlers and drain before exit.
STOPSIGNAL SIGTERM
# Default command runs the web server. Workers override `command:` in compose.
CMD ["npm", "run", "start"]
