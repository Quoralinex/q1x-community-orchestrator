---
layout: default
title: Dynamic teams and programme supervision
---

# Dynamic teams and adaptive programme supervision

Phase 7 adds a provider-neutral supervision layer that turns the live capability registry into durable teams, work assignments and repeatable supervision cycles. It does not require a hosted orchestration service or a particular AI provider.

## Core model

The supervision runtime uses six public contracts:

- `ExecutionBinding` connects a discovered capability to an executable model, adapter, browser, desktop or externally supplied executor.
- `SupervisionPolicy` sets concurrency, attempt, budget, deadline, trust, privacy and checkpoint constraints.
- `TeamPlan` records the logical specialists selected for a programme and the work items allocated to them.
- `WorkAssignment` records each durable execution attempt without persisting the execution input or returned content.
- `SupervisionCycle` records dependency-aware progress and the reason a cycle stopped.
- `ProgrammeProposal` carries a validated programme/work-graph revision for planning and replanning.

The contracts are normative JSON Schema 2020-12 definitions under `packages/contracts/schemas/v1/`; the TypeScript package supplies reference SDK types.

## Capability routing and team formation

Team formation starts from ready work-graph nodes and their capability requirements. Candidate capabilities are hard-filtered for required operations, adapter kind, modality, availability, allowed execution location and minimum trust. Eligible candidates are then ordered deterministically using policy preferences such as no-usage-fee execution, local execution and binding priority.

A team member is a logical specialist selected for one or more work items. The runtime records the primary capability and execution binding plus ranked alternates. This allows a failed assignment to be replaced with another eligible binding on a subsequent attempt without changing the public work item.

Execution bindings support:

- model endpoints;
- MCP, A2A and CLI/TUI adapter endpoints;
- browser endpoints;
- desktop/application endpoints;
- external executors registered by an embedding application.

External bindings deliberately do not persist an endpoint identifier. Their executable implementation is supplied in memory by the embedding process.

## Dependency-aware supervision

A supervision cycle:

1. promotes dependency-satisfied pending or retryable work to `ready`;
2. stops before execution if an unresolved work item requires approval;
3. forms a team for currently runnable work;
4. applies concurrency, attempt and budget constraints;
5. records planned assignments before execution;
6. marks assigned graph nodes as running;
7. executes work through the selected binding;
8. records metadata-only assignment outcomes;
9. advances completed dependencies or marks failed/cancelled work;
10. persists a `SupervisionCycle` and optional checkpoint.

The runtime can continue cycles through `superviseUntilStop()` until it reaches a convergence or governance boundary.

## Stop and escalation rules

Supported stop reasons are:

- `completed`;
- `idle`;
- `blocked`;
- `approval-required`;
- `budget-exhausted`;
- `deadline-reached`;
- `replan-required`;
- `max-cycles`;
- `cancelled`.

Known-cost work that cannot fit within the remaining programme budget is reported as `budget-exhausted`, even when the current spend has not yet reached the budget ceiling. Unknown-cost candidates can be prohibited with `allowUnknownCost: false`.

Repeated failures can trigger `replan-required` using either the maximum attempts per work item or a configured failure threshold. If the policy names a registered planning strategy, the runtime can request a new `ProgrammeProposal`, validate it against current state, checkpoint the existing programme and apply the accepted revision.

## Proposal validation and recovery

Programme proposals are validated before acceptance. Validation checks include:

- mission and programme references;
- programme and work-graph revision sequencing;
- permitted lifecycle transitions;
- work-graph structure and dependency validity;
- consistency between the proposal, programme and work graph.

When an existing programme is replaced by an accepted proposal, the runtime creates a checkpoint by default and records a replan event. The existing checkpoint/restore mechanism therefore remains the recovery boundary for adaptive supervision.

## CLI

After building the repository, the Phase 7 CLI can configure capabilities and execution bindings, form teams and validate programme proposals.

```bash
node packages/runtime/dist/cli.js --home .q1x capabilities put \
  --file examples/software-delivery/capability.json

node packages/runtime/dist/cli.js --home .q1x bindings put \
  --file examples/supervision/example.execution-binding.json

node packages/runtime/dist/cli.js --home .q1x team form programme.example \
  --policy examples/supervision/example.supervision-policy.json

node packages/runtime/dist/cli.js --home .q1x team assignments programme.example
```

Additional commands include `bindings list/get`, `team plans`, `assignment cancel`, `proposal validate/accept`, and `supervision cycle/run/cycles`.

The supplied execution-binding example is intentionally illustrative. A binding must reference a capability already present in the live registry before it can be persisted by the runtime.

## Security and data boundaries

Phase 7 preserves the Community Orchestrator's existing public boundaries:

- no provider is mandatory;
- no private Q1X control-plane implementation is included;
- secrets remain resolved by the underlying endpoint/adapter at execution time;
- work inputs and model/browser/desktop returned content are not copied into supervision audit records;
- consequential work remains fail-closed when an unresolved approval is required;
- execution-location and trust constraints can be enforced before a capability is selected.

Audit and assignment records contain routing identifiers, state transitions, timing, result references and bounded usage metadata rather than session content.

## API surface

The runtime extension exposes:

- `putExecutionBinding()`, `getExecutionBinding()`, `listExecutionBindings()`;
- `rankCapabilities()`;
- `formTeam()`, `getTeamPlan()`, `listTeamPlans()`;
- `getWorkAssignment()`, `listWorkAssignments()`, `cancelWorkAssignment()`;
- `runSupervisionCycle()`, `superviseUntilStop()`, `listSupervisionCycles()`;
- `registerWorkExecutor()`;
- `registerPlanningStrategy()`, `planProgramme()`;
- `validateProgrammeProposal()`, `acceptProgrammeProposal()`.

This keeps team formation and programme supervision on the same provider-neutral execution boundaries delivered in Phases 1–6B.
