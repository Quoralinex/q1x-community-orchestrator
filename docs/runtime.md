---
layout: default
title: Open Control Runtime
---

# Open Control Runtime

Phase 2 adds the first executable orchestration runtime. It persists Phase 1 mission, programme and work-graph contracts locally, adds semantic validation that JSON Schema cannot express, records execution lifecycle documents and provides transactional programme checkpoints.

> **Status:** pre-alpha foundation. The runtime is executable and tested but is not yet a generally available production release.

## Requirements

- Node.js 24 or newer
- npm
- local filesystem access

No hosted database, AI provider, API key or paid service is required.

## Runtime home

The default runtime home is `~/.q1x-community-orchestrator` and contains `state.sqlite`.

Set `Q1X_HOME` or pass `--home <path>` to isolate a runtime. Tests and automation should use an explicit home.

```bash
q1x --home ./example-state init
```
## Core commands

Commands read and write the same public contract JSON used by the SDK.

```bash
q1x mission put --file mission.json
q1x mission list
q1x mission show mission.example

q1x programme put --file programme.json
q1x programme list
q1x graph put --file work-graph.json
q1x graph show graph.example

q1x status
q1x status --programme programme.example
```

Replanning and execution lifecycle documents can also be recorded without binding the runtime to an execution provider:

```bash
q1x replan record --file replan-event.json
q1x execution request --file execution-request.json
q1x execution result --file execution-result.json
```

Successful commands write JSON to stdout. Runtime failures write structured JSON errors to stderr and return a non-zero exit code.
## Checkpoints and recovery

A checkpoint captures the current document-head pointers for one programme scope. Immutable document versions are not copied or deleted.

```bash
q1x checkpoint create programme.example --id checkpoint.example.1
q1x checkpoint list --programme programme.example
q1x checkpoint restore checkpoint.example.1
```

Restore is transactional. Current programme, work-graph, replanning and execution heads created after the checkpoint are removed from the current view, and earlier heads are restored. Their immutable history remains in SQLite. Mission records are intentionally not rewound by a programme checkpoint.

## Semantic validation

The runtime validates every document against the normative Phase 1 schema and additionally enforces cross-document rules: referenced missions and programmes must exist, programme/work-graph revisions increase by one, graph references are valid, execution dependencies are acyclic, lifecycle transitions are legal, and execution results match one existing request.

`parentId` may refer to another graph node or a workstream in the owning programme. For `depends-on` and `blocks`, edges run from prerequisite/blocker to dependent/blocked node.

## Storage model

The local database stores immutable document versions, current head pointers, checkpoint snapshots and append-only runtime audit events. Public contract revisions remain distinct from internal storage revisions.

The original Phase 2 runtime bound no network port and executed no external tool or model. Subsequent pre-alpha phases have added capability discovery, model transport, MCP/A2A/CLI execution, browser/web control and desktop/application control on top of the same persistence and validation core. Dynamic teams remain the next roadmap phase.
