# ==========================================
# HaydenClaw Server - Multi-stage Dockerfile
# ==========================================

# --- Build stage ---
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vitest.config.ts ./
COPY postcss.config.js tailwind.config.js ./
COPY src/ src/

# Build server
RUN npx tsc -p tsconfig.node.json

# Build web frontend
RUN npx vite build --config src/web/vite.config.ts

# --- Production stage ---
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/shared ./dist/shared
COPY --from=build /app/dist/web ./dist/web

# Copy schema.sql (needed at runtime)
COPY src/server/db/schema.sql ./dist/server/db/schema.sql

# Create data directories
RUN mkdir -p /data/db /data/ipc /data/workspaces

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/db/haydenclaw.db
ENV IPC_BASE_DIR=/data/ipc
ENV WORKSPACE_BASE_DIR=/data/workspaces
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server/index.js"]
