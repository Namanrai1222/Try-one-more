# syntax=docker/dockerfile:1
# One file, two images:
#   docker build --target web .       Next.js site on :3000
#   docker build --target realtime .  Colyseus party server on :2567
# docker-compose.yml runs both; .github/workflows/cd.yml builds and publishes them.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
# Owned by `node`: the realtime image runs as that user and reads this source at runtime, and
# checkouts can carry owner-only (700) folder modes.
COPY --chown=node:node . .

# ---------------------------------------------------------------- web
FROM base AS web-build
# --ignore-scripts: the root `prepare` (husky) needs git; dependency build scripts are off anyway.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
# Baked into the client bundle; unset, the browser uses ws://localhost:2567 on localhost.
ARG NEXT_PUBLIC_REALTIME_URL=
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL NEXT_STANDALONE=1
RUN pnpm --filter @jom/web build

FROM node:24-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /repo/apps/web/public ./apps/web/public
# Challenge-card OG images read these fonts at request time (not traced by Next).
COPY --from=web-build --chown=node:node /repo/apps/web/assets ./apps/web/assets
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ---------------------------------------------------------------- realtime
# Runs its TypeScript directly (Node 24 type stripping), so it keeps the workspace layout:
# workspace packages resolve to packages/*, outside node_modules, where stripping is allowed.
FROM base AS realtime
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@jom/realtime..."
ENV NODE_ENV=production PORT=2567
USER node
EXPOSE 2567
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:2567/').then(()=>process.exit(0),()=>process.exit(1))"
CMD ["node", "apps/realtime/src/index.ts"]
