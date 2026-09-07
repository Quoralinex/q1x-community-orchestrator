# Deployment Model

## Supported pre-alpha installation profiles

Phase 8 supports two local-first deployment paths: a direct Node.js source installation and a reproducible Docker/Compose image. Neither path requires a hosted Q1X service, cloud account, model provider or paid API.

The runtime remains single-node and uses Node.js 24+ built-in SQLite. Its persistent state is stored under the runtime home as `state.sqlite` plus SQLite WAL files.

## Direct installation on macOS, Windows and Linux

Prerequisites:

- Node.js 24 or later;
- npm compatible with the repository lockfile;
- Git when installing from source.

From a clean checkout:

```bash
npm ci --no-audit --no-fund
npm run build
node packages/runtime/dist/cli.js --home ./.q1x init
node packages/runtime/dist/cli.js --home ./.q1x status
```

`Q1X_HOME` or `q1x --home <path>` selects the persistent runtime home. If neither is supplied, the runtime uses `~/.q1x-community-orchestrator`.

The cross-platform packaging workflow verifies this source-install path on current GitHub-hosted macOS, Windows and Ubuntu runners using Node.js 24. It also verifies contract/type/distribution checks and the local health/readiness process on each operating system.

Public npm packages remain alpha packages. Until the public-alpha release phase explicitly publishes and supports a registry release, the repository source install above is the authoritative local installation path.

## Local health and readiness process

Phase 8 includes a deliberately narrow process for service managers and containers:

```bash
Q1X_HOME=./.q1x \
Q1X_HOST=127.0.0.1 \
Q1X_PORT=8787 \
node packages/runtime/dist/service.js
```

It exposes only:

- `GET /healthz` — process health;
- `GET /readyz` — runtime/database readiness.

It does **not** expose orchestration, model, browser or desktop execution APIs. Direct local use binds to `127.0.0.1` by default. `Q1X_HOST` and `Q1X_PORT` are explicit environment configuration; an example is provided at `config/runtime.env.example`.

`SIGINT` and `SIGTERM` stop readiness first, close the HTTP listener and then close the SQLite runtime. This is the deterministic shutdown path used by container orchestration.

## Docker

Build the image from a clean checkout:

```bash
docker build --pull -t q1x-community-orchestrator:local .
```

Run it with persistent state:

```bash
docker volume create q1x-state

docker run --rm \
  --name q1x-community \
  -p 127.0.0.1:8787:8787 \
  -v q1x-state:/data \
  q1x-community-orchestrator:local
```

The image:

- uses Node.js 24 on Debian slim;
- builds TypeScript in a separate build stage;
- prunes development dependencies before the runtime stage;
- runs as fixed non-root UID/GID `10001`;
- persists `Q1X_HOME=/data` through a declared volume;
- binds the health process to `0.0.0.0:8787` inside the container;
- includes a Docker `HEALTHCHECK` against `/healthz`;
- does not bundle a browser binary or a model provider.

The host publishing examples bind the port to loopback so the health endpoint is not unintentionally exposed on the LAN.

## Docker Compose

The repository `compose.yaml` adds a hardened local profile:

```bash
docker compose up --build
```

It uses a named persistent volume, a read-only root filesystem, `/tmp` tmpfs, `cap_drop: ALL` and `no-new-privileges`. Stop grace is 10 seconds so the runtime can complete its deterministic shutdown path.

## Configuration model

Runtime packaging configuration is intentionally small:

| Variable | Direct default | Container default | Purpose |
| --- | --- | --- | --- |
| `Q1X_HOME` | `~/.q1x-community-orchestrator` | `/data` | Persistent state directory |
| `Q1X_HOST` | `127.0.0.1` | `0.0.0.0` | Health/readiness bind address |
| `Q1X_PORT` | `8787` | `8787` | Health/readiness TCP port |

Provider credentials are not part of this packaging configuration. Existing model/adapter credential references continue to resolve from the execution environment at invocation time and are never written into the example env file.

## Persistent state and upgrades

The SQLite database is opened in WAL mode and the runtime's current table creation is idempotent. Rebuilding or replacing the process/container while reusing the same `Q1X_HOME` therefore preserves current pre-alpha state.

For upgrades during pre-alpha:

1. stop the runtime cleanly;
2. copy or snapshot the complete runtime-home directory, including `state.sqlite`, `state.sqlite-wal` and `state.sqlite-shm` when present;
3. replace the checkout/image;
4. start against the same runtime home;
5. verify `/readyz` or `q1x status` before resuming work.

Phase 8 does not introduce a destructive automatic database migration. Any future schema change requiring a migration must be explicit, tested and documented before the public-alpha release. Downgrading across a future storage-schema migration is not claimed as supported unless that release explicitly documents it.

## Installation verification matrix

The `Cross-platform Packaging` GitHub Actions workflow provides evidence for:

| Surface | Linux | macOS | Windows |
| --- | :---: | :---: | :---: |
| clean `npm ci` | ✓ | ✓ | ✓ |
| TypeScript build | ✓ | ✓ | ✓ |
| runtime init/status | ✓ | ✓ | ✓ |
| health/readiness lifecycle | ✓ | ✓ | ✓ |
| contract/type/distribution verification | ✓ | ✓ | ✓ |
| package dry run | ✓ | ✓ | ✓ |
| Docker image/non-root/persistent restart | ✓ | n/a | n/a |

Docker is verified on Linux because the produced OCI image is the cross-platform container artifact; host-native Docker Desktop behavior is not separately claimed by this phase.

## Team / self-hosted future profile

A later team profile may replace embedded state with PostgreSQL, S3-compatible object storage and multiple workers while retaining the same orchestration contracts. Phase 8 does not require or activate that architecture.

## Distributed / cloud future profile

Cloudflare, AWS, Azure, GCP and private infrastructure remain deployment adapters rather than architectural dependencies. There is no mandatory hosted service in the Community Orchestrator.
