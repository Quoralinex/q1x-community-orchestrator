import { CONTRACT_VERSION, SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type {
  AcceptedProgrammeProposal,
  BrowserActionBatch,
  CapabilityCandidate,
  CapabilityRoutingRequirements,
  DesktopActionBatch,
  ExecutionBinding,
  ModelRequest,
  ProgrammeProposal,
  ProgrammeProposalValidation,
  SupervisionCycle,
  SupervisionPolicy,
  SupervisionRunResult,
  TeamFormationOptions,
  TeamPlan,
  WorkAssignment,
  WorkGraph,
  WorkNode
} from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { validateGraphStructure } from './graph-validation.js';
import { assertNextContractRevision, assertTransition } from './lifecycle.js';
import type { PlanningContext, PlanningStrategy } from './planning-strategy.js';
import { validateContract } from './schema-loader.js';
import { knownCapabilityCost, rankBoundCapabilities } from './supervision-allocator.js';
import { SqliteStore } from './store.js';
import type { WorkExecutionOutcome, WorkExecutor } from './work-executor.js';
import { OpenControlRuntime } from './runtime.js';

export interface SupervisionCycleOptions {
  inputsByWorkItem?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SupervisionRunOptions extends SupervisionCycleOptions {
  maxCycles?: number;
  evidence?: unknown[];
}

interface RuntimeStatusWithSupervision {
  counts: {
    executionBindings: number;
    teamPlans: number;
    workAssignments: number;
    supervisionCycles: number;
  };
}

declare module './runtime.js' {
  interface OpenControlRuntime {
    putExecutionBinding(binding: ExecutionBinding): ExecutionBinding;
    getExecutionBinding(id: string): ExecutionBinding | undefined;
    listExecutionBindings(): ExecutionBinding[];
    rankCapabilities(requirements: CapabilityRoutingRequirements, policy: SupervisionPolicy): CapabilityCandidate[];
    getTeamPlan(id: string): TeamPlan | undefined;
    listTeamPlans(programmeId?: string): TeamPlan[];
    listWorkAssignments(programmeId?: string): WorkAssignment[];
    getWorkAssignment(id: string): WorkAssignment | undefined;
    listSupervisionCycles(programmeId?: string): SupervisionCycle[];
    formTeam(programmeId: string, options: TeamFormationOptions): TeamPlan;
    registerWorkExecutor(kind: string, executor: WorkExecutor): void;
    registerPlanningStrategy(strategy: PlanningStrategy): void;
    planProgramme(missionId: string, strategyId: string, context?: Omit<PlanningContext, 'mission'>): Promise<ProgrammeProposal>;
    validateProgrammeProposal(proposal: ProgrammeProposal, options?: { throwOnInvalid?: boolean }): ProgrammeProposalValidation;
    acceptProgrammeProposal(proposal: ProgrammeProposal, options?: { checkpointBeforeApply?: boolean }): AcceptedProgrammeProposal;
    cancelWorkAssignment(assignmentId: string): WorkAssignment;
    runSupervisionCycle(programmeId: string, policy: SupervisionPolicy, options?: SupervisionCycleOptions): Promise<SupervisionCycle>;
    superviseUntilStop(programmeId: string, policy: SupervisionPolicy, options?: SupervisionRunOptions): Promise<SupervisionRunResult>;
  }
}

const executors = new WeakMap<OpenControlRuntime, Map<string, WorkExecutor>>();
const planners = new WeakMap<OpenControlRuntime, Map<string, PlanningStrategy>>();
const originalGetStatus = OpenControlRuntime.prototype.getStatus;

function withStore<T>(runtime: OpenControlRuntime, fn: (store: SqliteStore) => T): T {
  const store = SqliteStore.open(runtime.home);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function requireGraph(runtime: OpenControlRuntime, programmeId: string): WorkGraph {
  if (!runtime.getProgramme(programmeId)) throw new RuntimeError('INVALID_REFERENCE', `Programme not found: ${programmeId}`);
  const graphs = runtime.listWorkGraphs(programmeId);
  if (graphs.length !== 1) throw new RuntimeError('CONFLICT', `Supervision requires exactly one current work graph for ${programmeId}`);
  return graphs[0];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function intersect<T>(sets: T[][]): T[] | undefined {
  if (sets.length === 0) return undefined;
  return sets.slice(1).reduce((current, next) => current.filter(value => next.includes(value)), sets[0]);
}

function requirementsForNode(node: WorkNode): CapabilityRoutingRequirements {
  const requirements = node.capabilityRequirements ?? [];
  const operations = unique(requirements.map(requirement => requirement.operation));
  const adapterSets = requirements.flatMap(requirement => requirement.adapterKinds ? [requirement.adapterKinds] : []);
  const adapterKinds = intersect(adapterSets);
  return {
    operations: operations.length > 0 ? operations : ['execute'],
    ...(adapterKinds && adapterKinds.length > 0 ? { adapterKinds } : {}),
    inputModalities: unique(requirements.flatMap(requirement => requirement.inputModalities ?? [])),
    outputModalities: unique(requirements.flatMap(requirement => requirement.outputModalities ?? []))
  };
}

function dependenciesSatisfied(graph: WorkGraph, nodeId: string): boolean {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  return graph.edges
    .filter(edge => edge.type === 'depends-on' && edge.to === nodeId)
    .every(edge => byId.get(edge.from)?.status === 'completed');
}

function previousAttempts(runtime: OpenControlRuntime, programmeId: string, workItemId: string): WorkAssignment[] {
  return runtime.listWorkAssignments(programmeId).filter(assignment => assignment.workItemId === workItemId);
}

function currentKnownSpend(runtime: OpenControlRuntime, programmeId: string, policy: SupervisionPolicy): number {
  return runtime.listWorkAssignments(programmeId)
    .filter(assignment => assignment.status === 'succeeded')
    .reduce((total, assignment) => {
      const cost = assignment.usage?.cost;
      if (cost === undefined) return total;
      if (policy.currency && assignment.usage?.currency && assignment.usage.currency !== policy.currency) return total;
      return total + cost;
    }, 0);
}

function budgetBlocksReadyWork(runtime: OpenControlRuntime, graph: WorkGraph, readyIds: string[], policy: SupervisionPolicy): boolean {
  if (policy.maxKnownCost === undefined) return false;
  const remaining = policy.maxKnownCost - currentKnownSpend(runtime, graph.programmeId, policy);
  return readyIds.some(workItemId => {
    const node = graph.nodes.find(candidate => candidate.id === workItemId);
    if (!node) return false;
    const candidates = runtime.rankCapabilities(requirementsForNode(node), policy);
    if (candidates.length === 0) return false;
    return candidates.every(candidate => {
      const cost = knownCapabilityCost(candidate.capability);
      return cost !== undefined && cost > remaining;
    });
  });
}

function putTeamPlan(runtime: OpenControlRuntime, plan: TeamPlan): TeamPlan {
  validateContract(SCHEMA_IDS.teamPlan, plan);
  withStore(runtime, store => {
    store.putDocument({ kind: 'team-plan', id: plan.id, scopeId: plan.programmeId, document: plan });
    store.appendEvent('supervision.team.put', 'team-plan', plan.id, plan.programmeId, {
      workGraphRevision: plan.workGraphRevision,
      memberCount: plan.members.length,
      status: plan.status
    });
  });
  return plan;
}

function putAssignment(runtime: OpenControlRuntime, assignment: WorkAssignment): WorkAssignment {
  validateContract(SCHEMA_IDS.workAssignment, assignment);
  withStore(runtime, store => {
    store.putDocument({ kind: 'work-assignment', id: assignment.id, scopeId: assignment.programmeId, document: assignment });
    store.appendEvent('supervision.assignment.put', 'work-assignment', assignment.id, assignment.programmeId, {
      workItemId: assignment.workItemId,
      capabilityId: assignment.capabilityId,
      bindingId: assignment.bindingId,
      attempt: assignment.attempt,
      status: assignment.status,
      errorCode: assignment.errorCode
    });
  });
  return assignment;
}

function putCycle(runtime: OpenControlRuntime, cycle: SupervisionCycle): SupervisionCycle {
  validateContract(SCHEMA_IDS.supervisionCycle, cycle);
  withStore(runtime, store => {
    store.putDocument({ kind: 'supervision-cycle', id: cycle.id, scopeId: cycle.programmeId, document: cycle });
    store.appendEvent('supervision.cycle.put', 'supervision-cycle', cycle.id, cycle.programmeId, {
      sequence: cycle.sequence,
      status: cycle.status,
      assignmentCount: cycle.assignmentIds.length,
      stopReason: cycle.stopReason
    });
  });
  return cycle;
}

function updateGraph(runtime: OpenControlRuntime, graph: WorkGraph, nodes: WorkNode[]): WorkGraph {
  const next: WorkGraph = {
    ...graph,
    revision: graph.revision + 1,
    nodes,
    updatedAt: new Date().toISOString()
  };
  return runtime.putWorkGraph(next);
}

function promoteRunnable(runtime: OpenControlRuntime, graph: WorkGraph, policy: SupervisionPolicy): WorkGraph {
  let changed = false;
  const nodes = graph.nodes.map(node => {
    if (node.approvalRequired) return node;
    if (node.status === 'pending' && dependenciesSatisfied(graph, node.id)) {
      changed = true;
      return { ...node, status: 'ready' as const };
    }
    if (['failed', 'blocked'].includes(node.status)) {
      const attempts = previousAttempts(runtime, graph.programmeId, node.id);
      const retryable = attempts.length < policy.maxAttemptsPerWorkItem && attempts.at(-1)?.status !== 'running';
      if (retryable && dependenciesSatisfied(graph, node.id)) {
        changed = true;
        return { ...node, status: 'ready' as const };
      }
    }
    return node;
  });
  return changed ? updateGraph(runtime, graph, nodes) : graph;
}

function stopReasonForGraph(runtime: OpenControlRuntime, graph: WorkGraph, policy: SupervisionPolicy): SupervisionCycle['stopReason'] {
  if (graph.nodes.length > 0 && graph.nodes.every(node => node.status === 'completed')) return 'completed';
  if (graph.nodes.some(node => node.status === 'cancelled')) return 'cancelled';
  if (graph.nodes.some(node => node.approvalRequired && !['completed', 'cancelled'].includes(node.status))) return 'approval-required';
  if (policy.deadlineAt && Date.now() >= Date.parse(policy.deadlineAt)) return 'deadline-reached';
  if (policy.maxKnownCost !== undefined && currentKnownSpend(runtime, graph.programmeId, policy) >= policy.maxKnownCost) return 'budget-exhausted';
  const attemptsExhausted = graph.nodes.some(node => node.status === 'failed' && previousAttempts(runtime, graph.programmeId, node.id).length >= policy.maxAttemptsPerWorkItem);
  const failureThresholdReached = policy.failureThresholdBeforeReplan !== undefined && runtime.listWorkAssignments(graph.programmeId).filter(assignment => assignment.status === 'failed').length >= policy.failureThresholdBeforeReplan;
  if (attemptsExhausted || failureThresholdReached) return 'replan-required';
  return undefined;
}

function validateBindingEndpoint(runtime: OpenControlRuntime, binding: ExecutionBinding): void {
  if (binding.executorKind === 'external') {
    if (binding.endpointId) throw new RuntimeError('CONFLICT', 'External execution bindings must not persist an endpoint id');
    return;
  }
  if (!binding.endpointId) throw new RuntimeError('INVALID_REFERENCE', `Execution binding requires endpointId: ${binding.id}`);
  const exists = binding.executorKind === 'model-endpoint' ? runtime.getModelEndpoint(binding.endpointId)
    : binding.executorKind === 'adapter-endpoint' ? runtime.getAdapterEndpoint(binding.endpointId)
    : binding.executorKind === 'browser-endpoint' ? runtime.getBrowserEndpoint(binding.endpointId)
    : runtime.getDesktopEndpoint(binding.endpointId);
  if (!exists) throw new RuntimeError('INVALID_REFERENCE', `Execution binding endpoint not found: ${binding.endpointId}`);
}

function putExecutionBinding(this: OpenControlRuntime, binding: ExecutionBinding): ExecutionBinding {
  validateContract(SCHEMA_IDS.executionBinding, binding);
  const capability = this.getCapability(binding.capabilityId);
  if (!capability) throw new RuntimeError('INVALID_REFERENCE', `Execution binding capability not found: ${binding.capabilityId}`);
  if (!binding.operations.every(operation => capability.operations.includes(operation))) {
    throw new RuntimeError('CONFLICT', `Execution binding operations exceed capability: ${binding.id}`);
  }
  validateBindingEndpoint(this, binding);
  withStore(this, store => {
    store.putDocument({ kind: 'execution-binding', id: binding.id, scopeId: null, document: binding });
    store.appendEvent('supervision.binding.put', 'execution-binding', binding.id, null, {
      capabilityId: binding.capabilityId,
      executorKind: binding.executorKind,
      enabled: binding.enabled
    });
  });
  return binding;
}

function getExecutionBinding(this: OpenControlRuntime, id: string): ExecutionBinding | undefined {
  return withStore(this, store => store.getDocument<ExecutionBinding>('execution-binding', id));
}

function listExecutionBindings(this: OpenControlRuntime): ExecutionBinding[] {
  return withStore(this, store => store.listDocuments<ExecutionBinding>('execution-binding'));
}

function rankCapabilities(this: OpenControlRuntime, requirements: CapabilityRoutingRequirements, policy: SupervisionPolicy): CapabilityCandidate[] {
  validateContract(SCHEMA_IDS.supervisionPolicy, policy);
  return rankBoundCapabilities(this.listCapabilities(), this.listExecutionBindings(), requirements, policy);
}

function getTeamPlan(this: OpenControlRuntime, id: string): TeamPlan | undefined {
  return withStore(this, store => store.getDocument<TeamPlan>('team-plan', id));
}

function listTeamPlans(this: OpenControlRuntime, programmeId?: string): TeamPlan[] {
  return withStore(this, store => store.listDocuments<TeamPlan>('team-plan', programmeId));
}

function getWorkAssignment(this: OpenControlRuntime, id: string): WorkAssignment | undefined {
  return withStore(this, store => store.getDocument<WorkAssignment>('work-assignment', id));
}

function listWorkAssignments(this: OpenControlRuntime, programmeId?: string): WorkAssignment[] {
  return withStore(this, store => store.listDocuments<WorkAssignment>('work-assignment', programmeId));
}

function listSupervisionCycles(this: OpenControlRuntime, programmeId?: string): SupervisionCycle[] {
  return withStore(this, store => store.listDocuments<SupervisionCycle>('supervision-cycle', programmeId));
}

function formTeam(this: OpenControlRuntime, programmeId: string, options: TeamFormationOptions): TeamPlan {
  validateContract(SCHEMA_IDS.supervisionPolicy, options.policy);
  const graph = requireGraph(this, programmeId);
  const ready = graph.nodes.filter(node => node.status === 'ready' && !node.approvalRequired && dependenciesSatisfied(graph, node.id));
  const sequence = this.listTeamPlans(programmeId).length + 1;
  const now = new Date().toISOString();
  const members: TeamPlan['members'] = [];
  const pendingAssignments: WorkAssignment[] = [];
  let reservedCost = currentKnownSpend(this, programmeId, options.policy);

  for (const node of ready) {
    const attempts = previousAttempts(this, programmeId, node.id);
    if (attempts.length >= options.policy.maxAttemptsPerWorkItem) continue;
    const requirements = requirementsForNode(node);
    const candidates = this.rankCapabilities(requirements, options.policy);
    const failedBindings = new Set(attempts.filter(assignment => ['failed', 'interrupted', 'cancelled'].includes(assignment.status)).map(assignment => assignment.bindingId));
    let candidate = candidates.find(value => !failedBindings.has(value.binding.id)) ?? candidates[0];
    if (!candidate) continue;
    if (options.policy.maxKnownCost !== undefined) {
      candidate = candidates.find(value => {
        const cost = knownCapabilityCost(value.capability);
        if (cost === undefined) return options.policy.allowUnknownCost !== false;
        return reservedCost + cost <= options.policy.maxKnownCost!;
      }) ?? candidate;
      const cost = knownCapabilityCost(candidate.capability);
      if (cost !== undefined && reservedCost + cost > options.policy.maxKnownCost) continue;
      if (cost !== undefined) reservedCost += cost;
    }
    const attempt = attempts.length + 1;
    const memberId = `member.${node.id}.a${attempt}`;
    const assignmentId = `assignment.${programmeId}.${node.id}.a${attempt}`;
    members.push({
      id: memberId,
      role: node.title,
      capabilityId: candidate.capability.id,
      bindingId: candidate.binding.id,
      operations: requirements.operations,
      workItemIds: [node.id],
      state: 'ready',
      alternates: candidates.slice(1, 4).map(alternate => ({ capabilityId: alternate.capability.id, bindingId: alternate.binding.id }))
    });
    pendingAssignments.push({
      contractVersion: CONTRACT_VERSION,
      id: assignmentId,
      programmeId,
      workGraphId: graph.id,
      workGraphRevision: graph.revision,
      workItemId: node.id,
      teamPlanId: `team.${programmeId}.${sequence}`,
      teamMemberId: memberId,
      bindingId: candidate.binding.id,
      capabilityId: candidate.capability.id,
      attempt,
      requirements,
      status: 'planned',
      createdAt: now,
      updatedAt: now
    });
  }

  const plan: TeamPlan = {
    contractVersion: CONTRACT_VERSION,
    id: `team.${programmeId}.${sequence}`,
    programmeId,
    workGraphId: graph.id,
    workGraphRevision: graph.revision,
    members,
    status: members.length > 0 ? 'active' : 'planned',
    createdAt: now,
    updatedAt: now
  };
  putTeamPlan(this, plan);
  for (const assignment of pendingAssignments) putAssignment(this, assignment);
  return plan;
}

function registerWorkExecutor(this: OpenControlRuntime, kind: string, executor: WorkExecutor): void {
  const registry = executors.get(this) ?? new Map<string, WorkExecutor>();
  if (registry.has(kind)) throw new RuntimeError('CONFLICT', `Work executor already registered: ${kind}`);
  registry.set(kind, executor);
  executors.set(this, registry);
}

function registerPlanningStrategy(this: OpenControlRuntime, strategy: PlanningStrategy): void {
  const registry = planners.get(this) ?? new Map<string, PlanningStrategy>();
  if (registry.has(strategy.id)) throw new RuntimeError('CONFLICT', `Planning strategy already registered: ${strategy.id}`);
  registry.set(strategy.id, strategy);
  planners.set(this, registry);
}

async function planProgramme(this: OpenControlRuntime, missionId: string, strategyId: string, context: Omit<PlanningContext, 'mission'> = {}): Promise<ProgrammeProposal> {
  const mission = this.getMission(missionId);
  if (!mission) throw new RuntimeError('INVALID_REFERENCE', `Planning mission not found: ${missionId}`);
  const strategy = planners.get(this)?.get(strategyId);
  if (!strategy) throw new RuntimeError('NOT_FOUND', `Planning strategy not registered: ${strategyId}`);
  const proposal = await strategy.propose({ mission, ...context });
  this.validateProgrammeProposal(proposal, { throwOnInvalid: true });
  return proposal;
}

function validateProgrammeProposal(this: OpenControlRuntime, proposal: ProgrammeProposal, options: { throwOnInvalid?: boolean } = {}): ProgrammeProposalValidation {
  const errors: string[] = [];
  try {
    validateContract(SCHEMA_IDS.programmeProposal, proposal);
    const mission = this.getMission(proposal.missionId);
    if (!mission) errors.push(`Mission not found: ${proposal.missionId}`);
    if (proposal.programme.missionId !== proposal.missionId) errors.push('Programme mission does not match proposal mission');
    if (proposal.workGraph.programmeId !== proposal.programme.id) errors.push('Work graph programme does not match proposed programme');
    const previousProgramme = this.getProgramme(proposal.programme.id);
    try { assertNextContractRevision(previousProgramme?.revision, proposal.programme.revision); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (previousProgramme) {
      try { assertTransition('programme', previousProgramme.status, proposal.programme.status); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    try { validateGraphStructure(proposal.workGraph, proposal.programme.workstreams.map(workstream => workstream.id)); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    const priorGraphs = this.listWorkGraphs(proposal.programme.id);
    if (priorGraphs.length > 1) errors.push(`Multiple current work graphs exist for ${proposal.programme.id}`);
    const priorGraph = priorGraphs[0];
    try { assertNextContractRevision(priorGraph?.revision, proposal.workGraph.revision); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (priorGraph) {
      const priorById = new Map(priorGraph.nodes.map(node => [node.id, node]));
      for (const node of proposal.workGraph.nodes) {
        const prior = priorById.get(node.id);
        if (!prior) continue;
        try { assertTransition('work-node', prior.status, node.status); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const result = { valid: errors.length === 0, errors };
  if (!result.valid && options.throwOnInvalid) throw new RuntimeError('SCHEMA_INVALID', 'Programme proposal rejected', { errors });
  return result;
}

function acceptProgrammeProposal(this: OpenControlRuntime, proposal: ProgrammeProposal, options: { checkpointBeforeApply?: boolean } = {}): AcceptedProgrammeProposal {
  this.validateProgrammeProposal(proposal, { throwOnInvalid: true });
  const existing = this.getProgramme(proposal.programme.id);
  const checkpoint = existing && options.checkpointBeforeApply !== false ? this.createCheckpoint(existing.id) : undefined;
  const programme = this.putProgramme(proposal.programme);
  const workGraph = this.putWorkGraph(proposal.workGraph);
  if (existing) {
    this.recordReplanEvent({
      contractVersion: CONTRACT_VERSION,
      id: `replan.${proposal.id}`,
      programmeId: programme.id,
      trigger: 'other',
      rationale: proposal.rationale,
      occurredAt: new Date().toISOString()
    });
  }
  return { proposalId: proposal.id, programme, workGraph, ...(checkpoint ? { checkpointId: checkpoint.id } : {}) };
}

function cancelWorkAssignment(this: OpenControlRuntime, assignmentId: string): WorkAssignment {
  const assignment = this.getWorkAssignment(assignmentId);
  if (!assignment) throw new RuntimeError('NOT_FOUND', `Work assignment not found: ${assignmentId}`);
  if (['succeeded', 'failed', 'cancelled'].includes(assignment.status)) return assignment;
  const updated = putAssignment(this, { ...assignment, status: 'cancelled', updatedAt: new Date().toISOString() });
  const graph = requireGraph(this, assignment.programmeId);
  const node = graph.nodes.find(candidate => candidate.id === assignment.workItemId);
  if (node?.status === 'running') updateGraph(this, graph, graph.nodes.map(candidate => candidate.id === node.id ? { ...candidate, status: 'blocked' as const } : candidate));
  return updated;
}

async function executeBoundWork(runtime: OpenControlRuntime, assignment: WorkAssignment, input: unknown, signal?: AbortSignal): Promise<WorkExecutionOutcome> {
  if (signal?.aborted) return { status: 'cancelled', errorCode: 'ABORTED' };
  const binding = runtime.getExecutionBinding(assignment.bindingId);
  if (!binding || !binding.enabled) return { status: 'failed', errorCode: 'BINDING_UNAVAILABLE' };
  const started = Date.now();
  const operation = runtime.beginExternalOperation({
    id: `operation.supervision.${assignment.id}`, kind: 'supervision', subjectId: assignment.id, retrySafe: false,
    metadata: { bindingId: binding.id, executorKind: binding.executorKind, workItemId: assignment.workItemId }
  });
  runtime.markExternalOperationDispatched(operation.id);
  const finish = (outcome: WorkExecutionOutcome): WorkExecutionOutcome => {
    runtime.completeExternalOperation(operation.id, {
      state: 'completed',
      ...(outcome.resultRef ? { resultRef: outcome.resultRef } : {}),
      metadata: { status: outcome.status, ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}) }
    });
    return outcome;
  };
  try {
    if (binding.executorKind === 'external') {
      const executor = executors.get(runtime)?.get('external') ?? executors.get(runtime)?.get(binding.id);
      if (!executor) throw new RuntimeError('TRANSPORT_NOT_FOUND', `External work executor not registered: ${binding.id}`);
      const outcome = await executor.execute({ binding, assignment, input, signal });
      return finish({ ...outcome, usage: { ...outcome.usage, durationMs: outcome.usage?.durationMs ?? Date.now() - started } });
    }
    if (!binding.endpointId) throw new RuntimeError('INVALID_REFERENCE', `Execution binding endpoint missing: ${binding.id}`);
    if (binding.executorKind === 'adapter-endpoint') {
      const request = {
        contractVersion: CONTRACT_VERSION,
        id: `execution.${assignment.id}`,
        workItemId: assignment.workItemId,
        requirements: assignment.requirements,
        input,
        contextRefs: assignment.contextRefs,
        createdAt: new Date().toISOString()
      };
      const result = await runtime.executeAdapter(binding.endpointId, request);
      return finish({ status: result.status, resultRef: result.id, usage: { cost: result.usage?.cost, currency: result.usage?.currency, durationMs: result.usage?.durationMs ?? Date.now() - started }, errorCode: result.error?.code });
    }
    if (binding.executorKind === 'model-endpoint') {
      const inputRecord = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
      const messages = Array.isArray(inputRecord.messages) ? inputRecord.messages : [{ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input ?? null) }];
      const request: ModelRequest = {
        contractVersion: CONTRACT_VERSION,
        id: `model.${assignment.id}`,
        endpointId: binding.endpointId,
        messages: messages as ModelRequest['messages'],
        createdAt: new Date().toISOString()
      };
      const response = await runtime.invokeModel(request);
      return finish({ status: 'succeeded', resultRef: response.id, usage: { durationMs: Date.now() - started } });
    }
    if (binding.executorKind === 'browser-endpoint') {
      const result = await runtime.runBrowserBatch(binding.endpointId, input as BrowserActionBatch, signal);
      return finish({ status: result.status, resultRef: result.id, usage: { durationMs: Date.now() - started } });
    }
    const result = await runtime.runDesktopBatch(binding.endpointId, input as DesktopActionBatch, signal);
    return finish({ status: result.status, resultRef: result.id, usage: { durationMs: Date.now() - started } });
  } catch (error) {
    const errorCode = error instanceof RuntimeError ? error.code : 'EXECUTION_FAILED';
    if (runtime.getExternalOperation(operation.id)?.state === 'dispatched') {
      runtime.completeExternalOperation(operation.id, { state: 'failed', errorCode });
    }
    return { status: 'failed', errorCode, usage: { durationMs: Date.now() - started } };
  }
}

async function runSupervisionCycle(this: OpenControlRuntime, programmeId: string, policy: SupervisionPolicy, options: SupervisionCycleOptions = {}): Promise<SupervisionCycle> {
  validateContract(SCHEMA_IDS.supervisionPolicy, policy);
  let graph = promoteRunnable(this, requireGraph(this, programmeId), policy);
  const sequence = this.listSupervisionCycles(programmeId).length + 1;
  const startedAt = new Date().toISOString();
  const earlyStop = stopReasonForGraph(this, graph, policy);
  const cycleId = `cycle.${programmeId}.${sequence}`;
  if (earlyStop) {
    return putCycle(this, {
      contractVersion: CONTRACT_VERSION,
      id: cycleId,
      programmeId,
      workGraphId: graph.id,
      workGraphRevision: graph.revision,
      sequence,
      status: earlyStop === 'completed' ? 'completed' : 'failed',
      readyWorkItemIds: [],
      assignmentIds: [],
      completedWorkItemIds: [],
      failedWorkItemIds: [],
      stopReason: earlyStop,
      startedAt,
      finishedAt: new Date().toISOString()
    });
  }

  const readyIds = graph.nodes.filter(node => node.status === 'ready' && !node.approvalRequired && dependenciesSatisfied(graph, node.id)).map(node => node.id);
  if (readyIds.length === 0) {
    return putCycle(this, {
      contractVersion: CONTRACT_VERSION, id: cycleId, programmeId, workGraphId: graph.id, workGraphRevision: graph.revision,
      sequence, status: 'failed', readyWorkItemIds: [], assignmentIds: [], completedWorkItemIds: [], failedWorkItemIds: [],
      stopReason: graph.nodes.some(node => ['pending', 'blocked', 'running'].includes(node.status)) ? 'blocked' : 'idle',
      startedAt, finishedAt: new Date().toISOString()
    });
  }

  const team = this.formTeam(programmeId, { policy });
  const assignments = this.listWorkAssignments(programmeId).filter(assignment => assignment.teamPlanId === team.id && assignment.status === 'planned');
  if (assignments.length === 0) {
    return putCycle(this, {
      contractVersion: CONTRACT_VERSION, id: cycleId, programmeId, workGraphId: graph.id, workGraphRevision: graph.revision,
      sequence, status: 'failed', readyWorkItemIds: readyIds, assignmentIds: [], completedWorkItemIds: [], failedWorkItemIds: [],
      stopReason: budgetBlocksReadyWork(this, graph, readyIds, policy) ? 'budget-exhausted' : 'blocked',
      startedAt, finishedAt: new Date().toISOString()
    });
  }

  const assignmentIds = assignments.map(assignment => assignment.id);
  const assignedWorkItemIds = new Set(assignments.map(assignment => assignment.workItemId));
  graph = updateGraph(this, graph, graph.nodes.map(node => assignedWorkItemIds.has(node.id) ? { ...node, status: 'running' as const } : node));
  const running = assignments.map(assignment => putAssignment(this, { ...assignment, status: 'running', workGraphRevision: graph.revision, updatedAt: new Date().toISOString() }));
  const outcomes = new Map<string, WorkExecutionOutcome>();
  const concurrency = Math.max(1, policy.maxConcurrentAssignments);
  for (let index = 0; index < running.length; index += concurrency) {
    const chunk = running.slice(index, index + concurrency);
    const chunkOutcomes = await Promise.all(chunk.map(async assignment => [assignment.id, await executeBoundWork(this, assignment, options.inputsByWorkItem?.[assignment.workItemId], options.signal)] as const));
    for (const [id, outcome] of chunkOutcomes) outcomes.set(id, outcome);
  }

  const completedWorkItemIds: string[] = [];
  const failedWorkItemIds: string[] = [];
  for (const assignment of running) {
    const outcome = outcomes.get(assignment.id)!;
    const status = outcome.status === 'succeeded' ? 'succeeded' : outcome.status === 'cancelled' ? 'cancelled' : 'failed';
    const usage = outcome.usage ? Object.fromEntries(Object.entries(outcome.usage).filter(([, value]) => value !== undefined)) as WorkAssignment['usage'] : undefined;
    putAssignment(this, {
      ...assignment,
      status,
      ...(outcome.resultRef ? { resultRef: outcome.resultRef } : {}),
      ...(usage && Object.keys(usage).length > 0 ? { usage } : {}),
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
      updatedAt: new Date().toISOString()
    });
    if (status === 'succeeded') completedWorkItemIds.push(assignment.workItemId); else failedWorkItemIds.push(assignment.workItemId);
  }

  graph = updateGraph(this, graph, graph.nodes.map(node => {
    const assignment = running.find(candidate => candidate.workItemId === node.id);
    if (!assignment) return node;
    const outcome = outcomes.get(assignment.id)!;
    if (outcome.status === 'succeeded') return { ...node, status: 'completed' as const };
    if (outcome.status === 'cancelled') return { ...node, status: 'cancelled' as const };
    return { ...node, status: 'failed' as const };
  }));

  const updatedMembers = team.members.map(member => {
    const assignment = running.find(candidate => candidate.teamMemberId === member.id);
    if (!assignment) return member;
    return { ...member, state: completedWorkItemIds.includes(assignment.workItemId) ? 'completed' as const : 'failed' as const };
  });
  putTeamPlan(this, { ...team, members: updatedMembers, status: updatedMembers.every(member => member.state === 'completed') ? 'completed' : 'active', updatedAt: new Date().toISOString() });

  let checkpointId: string | undefined;
  if (policy.checkpointEveryCycles && sequence % policy.checkpointEveryCycles === 0) checkpointId = this.createCheckpoint(programmeId).id;
  const stopReason = stopReasonForGraph(this, graph, policy);
  return putCycle(this, {
    contractVersion: CONTRACT_VERSION,
    id: cycleId,
    programmeId,
    workGraphId: graph.id,
    workGraphRevision: graph.revision,
    sequence,
    status: failedWorkItemIds.length > 0 ? 'failed' : 'completed',
    readyWorkItemIds: readyIds,
    assignmentIds,
    completedWorkItemIds,
    failedWorkItemIds,
    ...(stopReason ? { stopReason } : {}),
    ...(checkpointId ? { checkpointId } : {}),
    startedAt,
    finishedAt: new Date().toISOString()
  });
}

async function superviseUntilStop(this: OpenControlRuntime, programmeId: string, policy: SupervisionPolicy, options: SupervisionRunOptions = {}): Promise<SupervisionRunResult> {
  validateContract(SCHEMA_IDS.supervisionPolicy, policy);
  const maxCycles = Math.max(1, options.maxCycles ?? 100);
  const cycles: SupervisionCycle[] = [];
  for (let index = 0; index < maxCycles; index += 1) {
    if (options.signal?.aborted) return { programmeId, stopReason: 'cancelled', cycles };
    const cycle = await this.runSupervisionCycle(programmeId, policy, options);
    cycles.push(cycle);
    if (!cycle.stopReason) continue;
    if (cycle.stopReason === 'replan-required' && policy.plannerStrategyId && planners.get(this)?.has(policy.plannerStrategyId)) {
      const programme = this.getProgramme(programmeId);
      if (!programme) throw new RuntimeError('INVALID_REFERENCE', `Programme not found: ${programmeId}`);
      const proposal = await this.planProgramme(programme.missionId, policy.plannerStrategyId, {
        programme,
        workGraph: requireGraph(this, programmeId),
        policy,
        recentCycles: this.listSupervisionCycles(programmeId).slice(-5),
        evidence: options.evidence
      });
      this.acceptProgrammeProposal(proposal, { checkpointBeforeApply: true });
      continue;
    }
    return { programmeId, stopReason: cycle.stopReason, cycles };
  }
  return { programmeId, stopReason: 'max-cycles', cycles };
}

function patchedGetStatus(this: OpenControlRuntime, programmeId?: string): ReturnType<OpenControlRuntime['getStatus']> & RuntimeStatusWithSupervision {
  const status = originalGetStatus.call(this, programmeId);
  return {
    ...status,
    counts: {
      ...status.counts,
      executionBindings: this.listExecutionBindings().length,
      teamPlans: this.listTeamPlans(programmeId).length,
      workAssignments: this.listWorkAssignments(programmeId).length,
      supervisionCycles: this.listSupervisionCycles(programmeId).length
    }
  } as ReturnType<OpenControlRuntime['getStatus']> & RuntimeStatusWithSupervision;
}

Object.assign(OpenControlRuntime.prototype, {
  putExecutionBinding,
  getExecutionBinding,
  listExecutionBindings,
  rankCapabilities,
  getTeamPlan,
  listTeamPlans,
  getWorkAssignment,
  listWorkAssignments,
  listSupervisionCycles,
  formTeam,
  registerWorkExecutor,
  registerPlanningStrategy,
  planProgramme,
  validateProgrammeProposal,
  acceptProgrammeProposal,
  cancelWorkAssignment,
  runSupervisionCycle,
  superviseUntilStop,
  getStatus: patchedGetStatus
});
