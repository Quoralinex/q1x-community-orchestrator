# Phase 2 Open Control Runtime Design

## Status and goal

Phase 2 turns the Phase 1 contracts into a usable single-node control runtime. The goal is durable, restart-safe orchestration state for missions, programmes, work graphs, replanning, execution records and checkpoints without requiring a cloud service, external database or AI provider.

The Phase 1 JSON Schema 2020-12 documents remain normative. Runtime code may add cross-document and lifecycle rules, but it must not redefine the contract shapes.

## Chosen approach

Use a TypeScript runtime package on Node.js 24+ with Node's built-in `node:sqlite` module. State is stored in one SQLite database under a configurable runtime home; no ORM, native npm database addon, hosted database or paid service is required.

The runtime is deliberately synchronous at the persistence boundary because `DatabaseSync` is local, transactional and simple. Public service methods can remain straightforward now and be wrapped by asynchronous transports later without changing stored contracts.

## Alternatives considered

A JSON-file store would reduce code but would not provide reliable multi-record transactions, indexed queries or checkpoint restoration. An external SQLite addon would preserve older Node compatibility but adds native package installation and cross-platform build risk. Event sourcing was rejected for Phase 2 because it would expand the public semantics before the programme supervisor exists.
## Runtime package

Create `packages/runtime` as `@quoralinex/q1x-community-runtime`. It exports the runtime API and a `q1x` CLI binary. The package requires Node.js 24 or newer; the contracts and SDK remain independently consumable.

Default runtime home is `~/.q1x-community-orchestrator`. `Q1X_HOME` overrides it, and the CLI accepts `--home <path>` for deterministic tests and isolated installations.

The runtime home contains `state.sqlite`. Later phases may add artifact and cache directories without changing the database contract.

## Persistence model

SQLite uses four internal tables:

- `document_versions`: immutable versions of stored public contract documents, keyed by kind, id and storage revision.
- `document_heads`: one current version pointer per kind/id, including programme scope for scoped restore.
- `checkpoints`: immutable checkpoint contract plus a serialized snapshot of current head pointers for its programme scope.
- `runtime_events`: append-only internal audit events for puts, execution lifecycle operations, checkpoint creation and restore.

Public contract `revision` fields and internal storage revisions are separate. Internal revisions protect recovery for every document type; programme and work-graph contract revisions additionally obey monotonic semantic rules.
## Validation and semantic rules

Every public document is validated against the Phase 1 JSON Schema before persistence. The runtime loads the packaged normative schemas rather than reimplementing structural validation.

Cross-document rules are enforced in code:

- A programme can be stored only when its referenced mission exists.
- First programme and work-graph contract revisions must be `1`; subsequent revisions must increment by exactly one.
- A work graph can be stored only when its programme exists.
- Work-node ids must be unique, `parentId` must reference a node in the same graph or a workstream in the owning programme, and every edge endpoint must exist.
- Execution-dependency edges (`depends-on` and `blocks`) run from prerequisite/blocker to dependent/blocked node and must not form a directed cycle. Informational edges are not used for deadlock detection.
- Mission, programme and work-node lifecycle transitions are constrained; completed and cancelled states are terminal.
- An execution request must reference a non-terminal work node.
- An execution result must reference an existing request, match its work item, and may be recorded only once.

Validation failures are typed runtime errors with stable error codes suitable for later API and UI layers.
## Lifecycle rules

Mission transitions: `proposed -> active|cancelled`, `active -> paused|completed|cancelled`, `paused -> active|cancelled`; `completed` and `cancelled` are terminal.

Programme transitions: `planned -> active|cancelled`, `active -> paused|completed|cancelled`, `paused -> active|cancelled`; `completed` and `cancelled` are terminal.

Work-node transitions: `pending -> ready|cancelled`, `ready -> running|blocked|cancelled`, `running -> completed|failed|blocked|cancelled`, `blocked -> ready|cancelled`, `failed -> ready|cancelled`; `completed` and `cancelled` are terminal.

A newly stored document may begin in any schema-valid initial state because imports and recovery need to accept existing programmes. Transition checks apply only when a prior current version exists.

## Programme scoping and checkpoints

Programme-scoped records are programme, work graph, replan event, execution request and execution result documents. Execution records inherit scope from the work item in the current programme work graph.

`createCheckpoint(programmeId, checkpointId?)` captures the current head pointers for that programme scope and emits a Phase 1 `Checkpoint` document. Restoring a checkpoint transactionally replaces only the current heads in that programme scope with the captured snapshot. Immutable version history and runtime audit events are never deleted.

Mission records are not rewound by programme checkpoint restore. This prevents recovery of one programme from changing mission state used by another programme.
## Public runtime API

`OpenControlRuntime.open({ home? })` initializes or opens the store. The runtime exposes focused methods for mission, programme and work-graph persistence; replanning events; execution request/result recording; checkpoints; and status summaries.

The API returns typed Phase 1 SDK objects. List methods return current heads only. Historical internal versions remain an implementation detail in Phase 2.

`RuntimeStatus` reports runtime home, database path, counts of current missions/programmes/work graphs, pending execution requests, completed execution results, checkpoint count and the current contract version.

## CLI

The `q1x` binary is intentionally JSON-first and scriptable. Phase 2 commands are:

- `q1x init`
- `q1x status [--programme <id>]`
- `q1x mission put --file <json>` / `list` / `show <id>`
- `q1x programme put --file <json>` / `list` / `show <id>`
- `q1x graph put --file <json>` / `show <id>`
- `q1x replan record --file <json>`
- `q1x execution request --file <json>`
- `q1x execution result --file <json>`
- `q1x checkpoint create <programme-id> [--id <id>]`
- `q1x checkpoint list [--programme <id>]`
- `q1x checkpoint restore <checkpoint-id>`

All commands accept `--home <path>`. Success writes JSON to stdout. Validation and operational errors write a concise structured error to stderr and exit non-zero.
## Error handling

Stable runtime error codes include `SCHEMA_INVALID`, `NOT_FOUND`, `CONFLICT`, `INVALID_REFERENCE`, `INVALID_REVISION`, `INVALID_TRANSITION`, `GRAPH_CYCLE`, `EXECUTION_CONFLICT`, `CHECKPOINT_NOT_FOUND` and `STORAGE_ERROR`.

SQLite transactions wrap every multi-table mutation. Failed validation occurs before a transaction where possible. Failed transactions leave current heads unchanged.

The CLI never prints stack traces by default. A later diagnostics mode may expose them for maintainers.

## Testing strategy

Tests use temporary runtime homes and real SQLite databases; no database mocks are used. Each behaviour is developed red-green-refactor.

Coverage must include schema enforcement, missing references, revision rules, graph cycles, lifecycle transitions, execution request/result integrity, checkpoint restore, restart persistence, status summaries and CLI round trips.

The existing Phase 1 contract and distribution tests remain required. CI package dry-runs are extended to include the runtime package and its licence.

## Security and portability

The runtime binds no network port in Phase 2 and executes no external tools or models. It therefore introduces no provider credentials, remote attack surface or paid service dependency.

SQLite file paths are resolved with Node's cross-platform path APIs. SQL statements use bound parameters. JSON supplied by users is stored as data, never interpolated into SQL.
## Explicit Phase 2 boundaries

Phase 2 does not discover capabilities, select models, invoke AI providers, expose HTTP services, control browsers/desktops, form dynamic teams or execute MCP/A2A/CLI adapters. Those remain later roadmap phases.

Phase 2 also does not publish a generally available release. The repository remains pre-alpha after this phase; the runtime is an executable foundation for subsequent adapter and supervisor work.

## Acceptance criteria

Phase 2 is complete when a fresh checkout on Node 24+ can initialize a runtime, persist and reload valid Phase 1 mission/programme/work-graph state, reject invalid cross-document state, record execution lifecycle documents, create and restore programme checkpoints across process restarts, and perform the documented CLI round trips.

The full repository check, package dry-runs, npm audit, CodeQL and repository baseline must pass on the pull request and on merged `main` before Phase 2 is reported complete.
