# Upgrade and rollback

Phase 14 introduces explicit upgrade handling for the path toward the `1.0.0-rc.1` stable-readiness candidate. `1.0.0` is not commissioned by the current source state.

## Before upgrading

Stop active work, record the exact source/package version, run normal health and audit checks, and create a verified backup before any migration that can change durable state. Keep the backup outside the runtime home until the upgraded runtime is verified.

Use the migration commands in this order:

```bash
q1x --home <path> migration inspect
q1x --home <path> migration compatibility
q1x --home <path> migration dry-run --backup <verified-backup-path>
q1x --home <path> migration apply --backup <verified-backup-path>
```

The legacy Alpha 2 to schema-v1 migration is additive, but operators should still retain a verified backup for a real upgrade. Destructive registry steps fail closed unless a verified backup is supplied.

After migration, run `q1x --home <path> audit verify`, recovery reconciliation and normal status/doctor checks before resuming work.

## Rollback

Rollback is restore-based, not an assumption that an older executable can safely read newer state. If the upgrade must be reversed, stop the upgraded runtime and use the governed backup restore path into an absent or empty target:

```bash
q1x backup restore <verified-backup-path> --home <empty-target>
```

Verify the restored audit chain and state before using it. Do not point an older executable at state transformed by an incompatible newer migration unless that downgrade path is explicitly documented and tested.

## Evidence boundary

Phase 14 upgrade evidence exercises fresh state, the historical `v0.1.0-alpha.2` layout and the Phase 13 `0.2.0-beta.1` schema-v1 layout. It does not claim support for arbitrary private forks, corrupted databases or unlisted future schemas.

The software is licensed under the **PolyForm Noncommercial License 1.0.0** for permitted non-commercial use.
