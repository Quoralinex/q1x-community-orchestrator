# Deployment Model

## Personal / zero-provider-bill baseline

The implemented pre-alpha single-node runtime uses Node.js 24+ and a local SQLite database at `~/.q1x-community-orchestrator/state.sqlite` by default. `Q1X_HOME` or `q1x --home <path>` selects another runtime home. Local artifact storage, local inference, Docker and native packaging remain later delivery phases.



### Current local setup

```bash
npm ci
npm run build
node packages/runtime/dist/cli.js init
```

No hosted database, cloud account, model provider or API key is required for the Phase 2 runtime. It currently stores orchestration state only and does not expose a network service or invoke external workers.

## Team / self-hosted

A team profile can replace embedded state with PostgreSQL, S3-compatible object storage and multiple workers while retaining the same orchestration contracts.

## Distributed / cloud

Cloudflare, AWS, Azure, GCP and private infrastructure are deployment adapters rather than architectural dependencies.

The project will publish exact installation and upgrade procedures before any release is described as generally usable.
