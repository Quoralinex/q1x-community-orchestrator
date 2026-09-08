# Security Policy

Do not disclose exploitable vulnerabilities, credentials, private data or security-sensitive implementation details in a public issue.

Use GitHub's private vulnerability reporting feature when it is available for this repository. If private reporting is unavailable, contact a Quoralinex maintainer through the organisation before sharing technical details.

Security fixes follow the same protected-branch and review requirements as other changes, with disclosure coordinated after a fix is available.

## Current pre-alpha security posture

The Community runtime is local-first and pre-alpha. Security boundaries are designed to fail closed around configured endpoints, browser/desktop execution policy and consequential work approvals, but the project must not be treated as a hardened multi-tenant or enterprise identity system.

Phase 9 is introducing:

- single-use approval records for protected work;
- immutable evidence with bounded provenance and optional cryptographic content digests;
- recursively redacted, SHA-256-linked security audit receipts;
- startup audit-chain verification;
- checkpoint-backed reconciliation of interrupted running work.

See [`docs/security-hardening.md`](docs/security-hardening.md) for the exact behavior and limitations.

## Sensitive data boundary

Do not put credentials, API keys, authorization headers, cookies, browser session material, desktop UI secrets or private model prompts/outputs into examples, issues, pull requests, audit metadata or test fixtures.

Runtime audit receipts are metadata-oriented and redact secret-shaped keys, but redaction is a defence-in-depth measure, not permission to send secrets into the audit interface.

## Local trust assumptions

The current JSON-first local CLI does not cryptographically authenticate the actor identifiers placed in approval documents. Filesystem permissions, operating-system account controls and the security of the host remain part of the trusted computing base.

The local hash-linked audit chain detects modification, reordering and broken links among retained receipts. It is not externally anchored and cannot independently prove against complete tail truncation by an attacker who can rewrite the entire database. Do not represent it as an external transparency service.

## State backup

The runtime SQLite database contains orchestration state and security audit receipts. For filesystem backups, stop the service/container cleanly before copying the runtime home, or use a SQLite-aware online backup mechanism. Do not copy `state.sqlite` alone while WAL state may still be active and assume the result is a consistent security record.
