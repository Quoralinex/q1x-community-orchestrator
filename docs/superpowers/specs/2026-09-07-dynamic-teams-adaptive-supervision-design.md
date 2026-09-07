# Phase 7 Dynamic Teams and Adaptive Programme Supervision Design

**Status:** Approved architecture; written specification pending user review
**Date:** 7 September 2026
**Base:** Phase 6B merged `main` at `d9a8864c4be8faae341374ace754bfc29ebf328c`

## 1. Purpose

Phase 7 turns Q1X Community Orchestrator from a collection of durable contracts and executable capabilities into a general-purpose programme orchestrator. It dynamically matches work to live capabilities, forms temporary execution teams, supervises work, reacts to failures and capability changes, and replans when evidence or constraints invalidate the current programme.

The architecture is hybrid: the supervisor and allocator remain deterministic and provider-neutral, while open-ended programme planning may use an optional reasoning capability. A reasoning model or agent may propose work, but it never becomes the control plane and never writes orchestration state directly.

Phase 7 is divided into two delivery slices:

- **Phase 7A — Dynamic Team Formation and Capability Routing**
- **Phase 7B — Adaptive Programme Supervision and Replanning**

## 2. Non-negotiable design principles

1. **Capability routing, not model-brand routing.** Team members are roles backed by capabilities and execution bindings. Provider/model names are metadata, not architecture.
2. **Zero-paid-service baseline.** Routing, team formation, supervision of an existing programme and recovery require no paid model/API. Local/no-usage-fee capabilities are preferred when otherwise suitable.
3. **Reasoning is optional.** `supervise-existing` mode works deterministically with a supplied programme/work graph. `plan-and-supervise` may use a configured planning strategy.
4. **Planner output is untrusted input.** Every proposal passes JSON Schema and semantic validation before acceptance.
5. **Existing Phase 1–6 contracts remain authoritative.** Phase 7 composes missions, programmes, work graphs, capabilities, execution envelopes, checkpoints, evidence and adapters rather than replacing them.
6. **No private Q1X governance enters Community core.** Public contracts remain provider-, organization- and review-tool-neutral.
7. **Persist decisions, not secrets.** Team plans, assignments, cycles, bindings, status and metadata may be durable. Prompt contents, browser sessions, desktop state, credentials and provider secrets remain outside durable orchestration state unless an existing explicit artifact/evidence contract is used.
8. **PolyForm Noncommercial License 1.0.0 remains the public repository licence and package-distribution baseline.**

## 3. Considered approaches

### 3.1 LLM-first orchestrator — rejected

A model could own decomposition, routing, retries and replanning. This is flexible but makes correctness nondeterministic, creates provider/cost dependence, weakens recovery semantics and makes routing policy difficult to test.

### 3.2 Deterministic workflow engine only — rejected as incomplete

A deterministic scheduler can reliably supervise an existing work graph but cannot create a meaningful programme from a broad open-ended mission without some reasoning source.

### 3.3 Hybrid deterministic supervisor with optional planning intelligence — selected

Q1X owns durable state, eligibility, policy, routing, retries, lifecycle, checkpoints and validation. Optional planning strategies create proposals through any compatible reasoning capability. The deterministic runtime accepts, rejects or revises those proposals according to public contracts and semantic rules.

## 4. Phase 7A architecture

### 4.1 Execution binding

A new normative `ExecutionBinding` maps a capability descriptor to the executable endpoint or extension that can actually perform work.

Required fields:

- `contractVersion`
- `id`
- `capabilityId`
- `executorKind`
- `endpointId` where the executor is endpoint-backed
- `operations`
- `enabled`
- optional priority and non-secret metadata

Initial `executorKind` values:

- `model-endpoint`
- `adapter-endpoint`
- `browser-endpoint`
- `desktop-endpoint`
- `external`

The binding is deliberately separate from `CapabilityDescriptor`. A capability describes what is available; a binding describes how Q1X invokes it. This prevents the capability registry from being polluted with endpoint-specific execution mechanics.

Discovery of known executable endpoints should create or refresh deterministic bindings where possible. Custom integrations may register external bindings through the public runtime API.

### 4.2 Team plan

A new normative `TeamPlan` describes a temporary logical team formed for a programme or supervision cycle.

A team member contains:

- logical member id;
- role name and objective;
- selected capability id;
- selected binding id;
- supported operations used by the current plan;
- work item ids currently assigned;
- state (`planned`, `ready`, `running`, `blocked`, `completed`, `failed`);
- alternates ordered deterministically.

Members are not long-lived model identities. If an equivalent capability becomes unavailable, a later cycle may replace the backing capability while preserving the logical role.

### 4.3 Work assignment

A new normative `WorkAssignment` connects one work-graph node to one team member/binding for one attempt.

It contains:

- programme/work-graph revision reference;
- work item id;
- team/member/binding/capability ids;
- attempt number;
- normalized requirements copied from the work item;
- optional execution input and context references;
- assignment status;
- creation/update timestamps.

Execution input is an opaque contract value. The selected executor determines the input shape:

- adapter endpoints consume existing `ExecutionRequest` semantics;
- model endpoints consume model-request compatible input;
- browser endpoints consume `BrowserActionBatch` input;
- desktop endpoints consume `DesktopActionBatch` input;
- external executors validate through their own extension contract.

Q1X never fabricates a browser or desktop action batch from a vague title without a planning/executor strategy capable of producing that shape.

### 4.4 Deterministic capability allocator

The allocator is a pure, independently testable unit. It receives a work requirement, live capabilities, execution bindings and supervision policy, then returns ordered eligible candidates.

Eligibility is hard-gated by:

1. capability availability must be `available`;
2. all required operations must be supported;
3. requested adapter kinds must match when supplied;
4. required input/output modalities must match;
5. `localOnly` work may only use local execution;
6. capability trust must meet `minimumTrust`;
7. privacy policy must allow the capability's execution location;
8. a usable enabled execution binding must exist;
9. platform restrictions must be compatible with the binding/endpoint;
10. estimated cost must fit the remaining cycle/programme budget when cost information is known.

Eligible candidates are sorted deterministically. Default preference order is:

1. policy-explicit preferred capability/binding;
2. `no-usage-fee` cost class;
3. local execution when privacy/policy otherwise permits both;
4. higher validated trust;
5. lower known unit cost;
6. healthier/recent availability metadata;
7. stable lexical capability id as the final tie-break.

This ordering is configurable by policy but must remain deterministic for identical inputs.

### 4.5 Dynamic team formation

For each ready work item selected for the next cycle, the team former requests ranked candidates from the allocator. It groups compatible assignments by logical role/capability where useful but does not create a permanent org chart.

A single capability may fill multiple logical roles when concurrency and policy permit. Conversely, one logical role may have primary and alternate bindings.

Team formation returns a plan; it does not execute work. This keeps routing explainable and testable before side effects occur.

## 5. Planning architecture

### 5.1 Programme proposal

A new normative `ProgrammeProposal` contains:

- proposal id and mission id;
- proposed `Programme` document;
- proposed `WorkGraph` document;
- optional assignment inputs/directives keyed by work item;
- assumptions and rationale;
- planner strategy id and capability reference when applicable;
- proposal timestamp.

A proposal is not durable programme authority until accepted.

### 5.2 Proposal validation

Acceptance performs both schema and semantic validation:

- programme mission id must match the target mission;
- programme/work-graph ids and revisions must be internally consistent;
- workstream parent references must be valid;
- graph node/edge references must exist;
- execution dependencies must remain acyclic;
- outcome/workstream coverage must not be empty;
- capability requirements must use valid public adapter/modalities;
- assignment inputs may reference only existing proposed work items;
- proposal must not reopen terminal existing work without an explicit replan path;
- accepted revisions must follow runtime revision rules.

Invalid planner output is rejected as a proposal failure, not partially persisted.

### 5.3 Planning strategy registry

A public `PlanningStrategy` interface separates reasoning from the supervisor.

Initial built-in strategies:

- `model-endpoint`: invoke a configured model transport and require a structured `ProgrammeProposal` response;
- `adapter-endpoint`: invoke an MCP/A2A/CLI-capable endpoint through the existing execution adapter and require a structured proposal;
- `manual`: accept a user/external proposal through the runtime/CLI without invoking a planner.

Additional strategies may be plugins. A browser-hosted reasoning service may participate through a plugin/agent strategy, but Community core does not assume an arbitrary webpage is a planner.

No strategy receives authority to bypass validation or policy.

## 6. Phase 7B adaptive supervisor

### 6.1 Supervision policy

A normative `SupervisionPolicy` controls execution and replanning. Initial fields include:

- maximum concurrent assignments;
- maximum attempts per work item;
- retry backoff policy;
- maximum known cost per cycle/programme plus currency;
- allowed execution locations;
- minimum trust;
- preference for no-usage-fee/local capability;
- failure threshold before replanning;
- checkpoint cadence;
- planner strategy id for replanning, if any;
- stop conditions (`idle`, `blocked`, `completed`, `budget-exhausted`, `approval-required`).

Defaults must be conservative and deterministic.

### 6.2 Supervision cycle

A normative `SupervisionCycle` is the durable record of one scheduler iteration. It records metadata and orchestration decisions, not provider secrets/content.

A cycle contains:

- programme id and starting graph revision;
- ready/running/blocked work item ids;
- team-plan id;
- assignment ids launched/continued/completed/failed;
- retry/reroute decisions;
- resulting graph revision when state changed;
- checkpoint id when created;
- replan-event/proposal ids when triggered;
- aggregate known cost/duration metadata;
- terminal cycle state and timestamps.

### 6.3 Ready-work calculation

The supervisor computes executable readiness from graph state and dependency edges rather than trusting a model-provided `ready` flag alone.

A pending/ready node is executable only when:

- all execution prerequisites are completed;
- no active blocking edge prevents it;
- required approval is satisfied where the existing approval contract says approval is required;
- at least one eligible capability/binding exists;
- policy budget/concurrency permits launch.

Nodes with unmet dependencies remain pending/blocked. Nodes with no eligible capability are reported as capability-blocked; they are not silently failed.

### 6.4 Execution lifecycle

For each assignment the supervisor:

1. records assignment state;
2. marks the work node running in the next valid graph revision;
3. dispatches through an executor registry keyed by binding `executorKind`;
4. records normalized outcome metadata;
5. updates assignment/work-node state;
6. releases concurrency capacity;
7. considers retry, reroute or replan.

Built-in executor adapters reuse the Phase 4–6 runtime methods rather than duplicating transport implementations.

Side-effecting executions are never run merely because a planner proposed them; they must be accepted into durable work state and pass routing/policy checks first.

### 6.5 Retry and reroute

Retry is allowed only when policy and normalized error semantics permit it. An attempt may:

- retry the same binding;
- reroute to the next eligible alternate;
- block pending capability recovery;
- trigger replanning after policy thresholds are met.

Attempt counters are durable so runtime restart cannot reset retry limits.

### 6.6 Replanning

Replanning triggers include:

- repeated work failure;
- capability becoming unavailable;
- new evidence invalidating assumptions;
- user/constraint change;
- dependency change;
- budget/policy change;
- explicit external request.

Before accepting a plan-changing revision, the runtime creates a programme checkpoint. It records a `ReplanEvent`, invokes the configured planning strategy if available, validates the returned `ProgrammeProposal`, then applies an accepted revision atomically.

Completed valid work remains completed unless the proposal explicitly identifies it as invalidated and the existing replan semantics permit that change. Q1X does not discard useful completed work merely because the plan changed.

If no planning strategy is configured, the supervisor records `replan-required` and stops at a controlled intervention point rather than inventing a plan.

### 6.7 Capability-change adaptation

Availability changes in the live capability registry are observed at cycle boundaries. A capability that becomes unavailable is excluded from new assignments. Ready work may be rebound to an alternate without invoking the planner when requirements remain unchanged.

A planner is required only when the existing work definition itself is no longer viable, not for ordinary failover.

## 7. Runtime API

Expected public runtime surfaces include:

- `put/get/listExecutionBinding`
- `rankCapabilities(requirements, policy)`
- `formTeam(programmeId, options)`
- `put/get/listTeamPlan`
- `put/get/listWorkAssignment`
- `validateProgrammeProposal(proposal)`
- `acceptProgrammeProposal(proposal)`
- `registerPlanningStrategy(strategy)`
- `planMission(missionId, strategyId, options)`
- `runSupervisionCycle(programmeId, policy, options)`
- `superviseUntilStop(programmeId, policy, options)`
- `getSupervisionState(programmeId)`

Long-running supervision remains process-bound in this phase. Phase 8 packaging may add a service/daemon deployment around the same runtime APIs.

## 8. CLI

The JSON-first CLI will expose bounded operations rather than a hidden background daemon:

```text
q1x bindings put/list/get
q1x team form <programme> [--policy file]
q1x team show <team-id>
q1x planner propose <mission> --strategy <id> [--file options]
q1x planner accept --file <proposal>
q1x supervise cycle <programme> --policy <file>
q1x supervise run <programme> --policy <file> [--max-cycles N]
q1x supervise status <programme>
```

`supervise run` stays in the foreground and terminates on a policy stop condition. Persistent background scheduling belongs to the later deployment/service layer.

## 9. Persistence and recovery

The existing SQLite document/version/event store is reused. New durable document kinds are expected for bindings, team plans, assignments, policies/cycles and proposals.

Supervisor state must be restart-safe:

- completed assignments stay completed;
- running assignments discovered after an unclean restart become `interrupted`/retry-eligible according to policy rather than being assumed successful;
- attempt counts remain durable;
- checkpoints precede accepted replans;
- cycles are idempotently identifiable so a restarted process cannot launch the same assignment twice merely because it reran scheduler logic.

## 10. Cost, privacy and trust

Routing uses the existing capability metadata rather than inventing provider-specific pricing policy.

Known cost is treated conservatively. When the allocator cannot establish that a candidate fits an enforced maximum-cost policy, that candidate is ineligible unless the policy explicitly permits unknown cost.

`localOnly` and execution-location restrictions are hard gates. A remote capability cannot be selected and then described as local simply because the orchestrator itself runs locally.

Trust ordering follows the existing public trust contract. Phase 7 consumes trust metadata; Phase 9 will harden how trust and approvals are established.

## 11. Concurrency

The initial supervisor uses bounded in-process concurrency. It does not require Redis, a message broker or distributed locks in the personal profile.

Assignments are selected deterministically before launch. Concurrency slots are released on success, failure or cancellation. The SQLite store remains the durable record; Phase 8 distributed/team deployment may introduce a distributed coordinator behind a stable interface.

## 12. Error and stop semantics

The supervisor must distinguish:

- `completed`: programme work complete;
- `idle`: nothing currently executable but no hard failure;
- `blocked`: dependencies, approvals or missing capabilities prevent progress;
- `replan-required`: current work definition is no longer viable and no automatic planner is configured;
- `budget-exhausted`: policy prevents further dispatch;
- `cancelled`: user/runtime cancellation;
- `failed`: supervisor invariant or unrecoverable persistence/validation failure.

Transport/provider errors are normalized through existing runtime mechanisms. Planner errors never corrupt current programme state.

## 13. Audit boundary

Phase 7 audit events record orchestration metadata such as:

- selected capability/binding ids;
- assignment ids and status;
- retry/reroute/replan decision codes;
- cycle identifiers and duration;
- aggregate known cost;
- accepted/rejected proposal id and validation result.

Audit events do not automatically persist prompts, model outputs, browser page contents, desktop content, credentials or secret environment values.

## 14. Testing strategy

Tests are deterministic and local-first. They will use synthetic capabilities, loopback model/adapter fixtures and existing browser/desktop test infrastructure where execution coverage is needed.

Phase 7A gate covers:

- execution-binding contracts and persistence;
- automatic binding for known endpoint capabilities;
- eligibility filtering across operation/adapter/modality/privacy/trust/platform/cost;
- stable deterministic ranking and tie-breaking;
- no-usage-fee/local preference;
- dynamic team formation and alternates;
- no-eligible-capability behavior;
- assignment persistence and attempt numbering.

Phase 7B gate covers:

- ready-work calculation from dependencies;
- bounded concurrency;
- successful execution lifecycle;
- retries and rerouting;
- budget stop;
- capability-offline failover;
- checkpoint-before-replan;
- invalid proposal rejection without partial state mutation;
- accepted proposal revision application;
- supervise-existing mode with no planner;
- model/adapter planning strategies against local fixtures;
- restart/interruption recovery;
- metadata-only audit behavior;
- CLI round trips;
- full contract/type/distribution/licence/security regression suite.

## 15. Public examples

Examples should demonstrate breadth rather than coding-only orchestration:

1. company launch mission with legal/market/website/operations workstreams;
2. digital R&D programme with research/experiment/evidence/replan flow;
3. software delivery programme as one workload among many;
4. a zero-cost local capability team showing deterministic routing without a paid API;
5. a capability outage example showing alternate selection without programme regeneration.

## 16. Delivery sequence

### Phase 7A

1. normative execution-binding/team/assignment contracts;
2. SDK types and schema catalog;
3. persistent binding registry;
4. automatic known-endpoint bindings;
5. deterministic allocator;
6. dynamic team formation;
7. assignment persistence and CLI;
8. examples/docs/tests;
9. protected PR and merged-main verification.

### Phase 7B

1. programme-proposal and supervision-policy/cycle contracts;
2. planning-strategy registry and proposal validator;
3. model/adapter planning strategies;
4. ready-work evaluator;
5. executor registry over existing Phase 4–6 transports;
6. supervision cycle;
7. retry/reroute/budget/concurrency controls;
8. checkpoint/replan integration;
9. restart recovery;
10. CLI/examples/docs;
11. protected PR and merged-main verification.

## 17. Explicitly out of scope

Phase 7 does not add:

- distributed scheduler infrastructure or Kubernetes coordination;
- a background daemon/service installer;
- stronger approval/evidence governance than the existing contract boundary;
- secret management product integration;
- hardware/device control;
- private Quoralinex authority/continuity/governance systems;
- mandatory hosted models or paid APIs.

Those remain later roadmap work or private-product concerns.

## 18. Success criteria

Phase 7 is complete when Q1X Community Orchestrator can:

1. take a valid existing programme/work graph and form an executable capability-backed team without any planning model;
2. deterministically route ready work according to capability, cost, privacy and trust requirements;
3. execute bounded work through existing model/adapter/browser/desktop pathways where a valid binding/input exists;
4. persist assignments/cycles/retries so restart does not erase orchestration history;
5. fail over to alternate capabilities when possible without regenerating the programme;
6. stop safely when approval, policy, budget or missing capability prevents progress;
7. optionally obtain a structured programme/replan proposal from a configured planning strategy;
8. reject invalid proposals without corrupting current state;
9. checkpoint and apply valid replans while retaining valid completed work;
10. operate with no mandatory paid model, database, queue or cloud service.
