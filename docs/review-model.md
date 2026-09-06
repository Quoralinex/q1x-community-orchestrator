---
layout: default
title: Review and governance
---

# Review and governance

Q1X Community Orchestrator separates **verification**, **primary code review**, and **independent review**. They are different controls and should not be collapsed into one AI reviewer.

## Target pull-request path

1. **CI verification** — build, lint, type checks, unit/integration tests and packaging checks.
2. **Security checks** — dependency and source scanning using no-mandatory-paid tooling; CodeQL is permitted for this public repository when executable code is present.
3. **Q1X Primary Review** — the normal-chat review path evaluates correctness, architecture, requirements, tests, maintainability, documentation and security implications.
4. **Goose Independent Review** — a separate reviewer path challenges the implementation and the primary review rather than repeating it.
5. **Required checks pass** — only genuine checks are added to the ruleset; placeholder green checks are prohibited.
6. **Review conversations resolved** — unresolved material findings block merge.
7. **Squash merge** — `main` remains linear and each accepted PR lands as one logical change.

## What GitHub does

GitHub supplies the pull-request review mechanism: diffs, comments, suggested changes, approvals, requested changes, CODEOWNERS, review conversations and rules that can require reviews. GitHub itself is not the first Q1X reviewer unless a separate GitHub AI review product is explicitly enabled.

## Codex boundary

Codex may be used as an implementation capability. It is not an independent code reviewer or merge authority for this project.
