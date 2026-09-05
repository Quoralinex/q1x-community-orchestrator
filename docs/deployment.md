# Deployment Model

## Personal / zero-provider-bill baseline

A single-node runtime should operate with an embedded database, local artifact storage and local inference. Docker and a native/local installation path are planned.

## Team / self-hosted

A team profile can replace embedded state with PostgreSQL, S3-compatible object storage and multiple workers while retaining the same orchestration contracts.

## Distributed / cloud

Cloudflare, AWS, Azure, GCP and private infrastructure are deployment adapters rather than architectural dependencies.

The project will publish exact installation and upgrade procedures before any release is described as generally usable.
