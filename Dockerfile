# ── Royal 1 engine (engine-royal) ──────────────────────────────────────────
# Production image for the standalone result/settlement worker.
# Runs scripts/settle-worker.ts, exposes the /health endpoint on port 4000.

FROM node:22-bookworm-slim AS base

# Prisma's query engine needs OpenSSL on Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# 1) Install dependencies. Copy the manifest + prisma schema first so
#    `npm install` (which runs `prisma generate` via postinstall) is cached.
COPY package*.json ./
COPY prisma ./prisma
# Dev deps (tsx, prisma CLI, typescript) are required to run/build the engine.
RUN npm install --include=dev

# 2) Copy the rest of the source.
COPY . .

# 3) Build step: regenerate the Prisma client and type-check the worker.
RUN npm run build

# 4) Health endpoint port (HEALTH_PORT in .env must match — default 4000).
EXPOSE 4000

# 5) Container healthcheck → GET /health (uses Node so no curl dependency).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.HEALTH_PORT||4000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# 6) Run the continuous settle-worker.
CMD ["npm", "run", "worker"]
