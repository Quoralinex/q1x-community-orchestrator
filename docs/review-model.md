---
layout: default
title: Review and governance
---

# Review and governance

Q1X Community Orchestrator uses a neutral, repository-level review model. The public project does not depend on Quoralinex's private review systems, internal agents, private control-plane governance, or company-specific tooling.

## Standard pull-request path

1. **CI verification** — build, lint, type checks, unit/integration tests and packaging checks appropriate to the change.
2. **Security checks** — dependency and source scanning appropriate to the repository. CodeQL may be used where available, but no paid security product is mandatory.
3. **Primary review** — a reviewer other than the change author evaluates correctness, architecture, requirements, tests, maintainability, documentation and security implications.
4. **Independent review** — a separate reviewer independently challenges the change and the primary review. The independent reviewer must not simply repeat the same review path.
5. **Required checks pass** — only genuine checks are added to branch rules; placeholder or synthetic green checks are prohibited.
6. **Review conversations resolved** — unresolved material findings block merge.
7. **Squash merge** — `main` remains linear and each accepted pull request lands as one logical change.

## Reviewer choice

The project does not mandate a particular commercial or AI review provider. Maintainers may use GitHub's native pull-request review features, human reviewers, self-hosted reviewers, or third-party review tools. A repository owner may configure products such as CodeRabbit, DeepSource, or another reviewer if they choose, but those products are not architectural dependencies of Q1X Community Orchestrator.

The primary and independent review roles should remain meaningfully separate. Where automated reviewers are used, maintainers should prefer different review paths, configurations, models, or providers so the independent review can catch failures the primary review may miss.

## What GitHub provides

GitHub supplies the pull-request review mechanism: diffs, comments, suggested changes, approvals, requested changes, CODEOWNERS, review conversations, status checks and rulesets. Repository owners decide which reviewers and optional review integrations they use.
