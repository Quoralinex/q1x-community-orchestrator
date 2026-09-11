# Operator Guide

This guide covers routine operation, recovery and evidence handling for a standalone Q1X Community Orchestrator runtime.

The Community runtime has no mandatory control plane and no private service dependency. Operators own the runtime home, credentials, provider endpoints, browser sessions and host permissions.

## Daily health checks

```bash
q1x doctor --home .q1x --json
q1x status --home .q1x
q1x limits show --home .q1x
q1x audit verify --home .q1x
```

Treat a weakened limit warning as an explicit operational exception. Do not assume a successful `doctor` result proves an external provider or physical desktop action beyond the evidence actually collected.

## Backup create and verify

```bash
q1x backup create --home .q1x --output ./backup-2026-09-11
q1x backup verify ./backup-2026-09-11
```

A backup contains the runtime database and governed local state needed for restoration plus hashes and schema metadata. Keep backups outside the active runtime home and protect them according to the sensitivity of your programme data.
## Backup restore

Restore only into an empty target runtime home:

```bash
q1x backup restore ./backup-2026-09-11 --home ./q1x-restored
q1x audit verify --home ./q1x-restored
q1x recovery reconcile --home ./q1x-restored
q1x status --home ./q1x-restored
```

A restore fails closed if the target is not empty or the backup does not verify. After restore, verify the audit chain and reconcile interrupted assignments before resuming work.

## Restart and interrupted work

```bash
q1x recovery reconcile --home .q1x
q1x recovery reconcile --home .q1x --programme <programme-id>
```

Reconciliation is designed to convert abandoned running assignments into explicit recoverable states rather than silently replaying side effects. Review approvals and external effects before resuming protected work.

## Audit and evidence

```bash
q1x audit list --home .q1x
q1x audit verify --home .q1x
q1x evidence list --home .q1x --programme <programme-id>
```
The local audit chain is tamper-evident, not externally witnessed. A successful local verification proves only the integrity relationship of the receipts still present in that runtime home.

Compatibility claims use three evidence tiers: `fixture`, `hosted-runner` and `physical-host`. Physical-host records must use the sanitized bounded evidence schema and must not contain user identity, private filesystem paths or secrets.

## Upgrade discipline

Before changing versions:

1. Run `doctor`, `limits show` and `audit verify`.
2. Create and verify a backup.
3. Record the current release/tag and runtime schema version.
4. Upgrade in a copy or controlled environment first.
5. Re-run doctor, audit verification, recovery reconciliation and the relevant compatibility checks.

For prerelease builds, assume breaking changes remain possible. Do not overwrite a known-good backup during upgrade testing.

## Incident sequence

If execution behaves unexpectedly, stop new protected work, preserve the runtime home, create a backup, run `audit verify`, capture non-secret diagnostic output, and identify whether the failure belongs to Q1X core, a connector, an external provider, browser state or the host accessibility layer.

See [Security, audit and recovery](security-hardening.md), [Deployment](deployment.md), [Compatibility Matrix](compatibility-matrix.md) and [CLI Reference](cli-reference.md).
