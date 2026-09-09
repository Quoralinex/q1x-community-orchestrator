# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sdk-typescript/package.json packages/sdk-typescript/package.json
COPY packages/adapter-sdk/package.json packages/adapter-sdk/package.json
COPY packages/desktop-bridge-common/package.json packages/desktop-bridge-common/package.json
COPY packages/desktop-bridge-macos/package.json packages/desktop-bridge-macos/package.json
COPY packages/desktop-bridge-windows/package.json packages/desktop-bridge-windows/package.json
COPY packages/desktop-bridge-linux/package.json packages/desktop-bridge-linux/package.json
COPY packages/runtime/package.json packages/runtime/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && npm run test:types \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="Q1X Community Orchestrator" \
      org.opencontainers.image.description="Provider-neutral, local-first Q1X Community Orchestrator runtime" \
      org.opencontainers.image.source="https://github.com/Quoralinex/q1x-community-orchestrator" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

WORKDIR /app
RUN groupadd --system --gid 10001 q1x \
 && useradd --system --uid 10001 --gid q1x --home-dir /nonexistent --shell /usr/sbin/nologin q1x \
 && mkdir -p /data \
 && chown q1x:q1x /data

COPY --from=build --chown=q1x:q1x /app/package.json /app/package-lock.json ./
COPY --from=build --chown=q1x:q1x /app/LICENSE ./LICENSE
COPY --from=build --chown=q1x:q1x /app/node_modules ./node_modules
COPY --from=build --chown=q1x:q1x /app/packages ./packages

ENV NODE_ENV=production \
    Q1X_HOME=/data \
    Q1X_HOST=0.0.0.0 \
    Q1X_PORT=8787

VOLUME ["/data"]
EXPOSE 8787
USER 10001:10001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.Q1X_PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "packages/runtime/dist/service.js"]
