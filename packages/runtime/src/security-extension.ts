import { CONTRACT_VERSION, SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { Approval, ApprovalDecision, AuditReceipt, AuditVerification, Evidence, WorkAssignment, WorkGraph } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { validateContract } from './schema-loader.js';
import { SecurityAuditStore } from './security-audit.js';
import { SqliteStore } from './store.js';
import { OpenControlRuntime } from './runtime.js';

declare module './runtime.js' {
  interface OpenControlRuntime {
    requestApproval(approval: Approval): Approval;
    getApproval(id: string): Approval | undefined;
    listApprovals(scopeId?: string): Approval[];
    decideApproval(id: string, decision: ApprovalDecision): Approval;
    applyApproval(id: string): { approval: Approval; workGraph: WorkGraph; checkpointId: string };
    recordEvidence(evidence: Evidence, scopeId?: string): Evidence;
    getEvidence(id: string): Evidence | undefined;
    listEvidence(scopeId?: string): Evidence[];
    appendAuditReceipt(eventType: string, subject: { id: string; kind?: string }, scopeId?: string, metadata?: Record<string, unknown>): AuditReceipt;
    listAuditReceipts(): AuditReceipt[];
    verifyAuditChain(): AuditVerification;
    reconcileInterruptedAssignments(programmeId?: string): { assignments: WorkAssignment[]; workGraphs: WorkGraph[] };
  }
}

function withStore<T>(runtime: OpenControlRuntime, fn: (store: SqliteStore) => T): T {
  const store = SqliteStore.open(runtime.home);
  try { return fn(store); } finally { store.close(); }
}

function withAudit<T>(runtime: OpenControlRuntime, fn: (store: SecurityAuditStore) => T): T {
  const store = SecurityAuditStore.open(runtime.home);
  try { return fn(store); } finally { store.close(); }
}

function scopeForSubject(runtime: OpenControlRuntime, subjectId: string): string | undefined {
  if (runtime.getProgramme(subjectId)) return subjectId;
  for (const graph of runtime.listWorkGraphs()) {
    if (graph.nodes.some(node => node.id === subjectId)) return graph.programmeId;
  }
  return undefined;
}

function requestApproval(this: OpenControlRuntime, approval: Approval): Approval {
  validateContract(SCHEMA_IDS.approval, approval);
  if (approval.state !== 'pending' || approval.decision) throw new RuntimeError('CONFLICT', 'New approval requests must be pending and undecided');
  const scopeId = scopeForSubject(this, approval.subject.id);
  withStore(this, store => {
    if (store.getHeadRevision('approval', approval.id) !== undefined) throw new RuntimeError('CONFLICT', `Approval already exists: ${approval.id}`);
    store.putDocument({ kind: 'approval', id: approval.id, scopeId: scopeId ?? null, document: approval });
    store.appendEvent('approval.requested', 'approval', approval.id, scopeId ?? null, { subjectId: approval.subject.id, requiredApproverKinds: approval.requiredApproverKinds ?? [] });
  });
  this.appendAuditReceipt('approval.requested', { id: approval.id, kind: 'approval' }, scopeId, { subjectId: approval.subject.id, requiredApproverKinds: approval.requiredApproverKinds ?? [] });
  return approval;
}

function getApproval(this: OpenControlRuntime, id: string): Approval | undefined {
  return withStore(this, store => store.getDocument<Approval>('approval', id));
}

function listApprovals(this: OpenControlRuntime, scopeId?: string): Approval[] {
  return withStore(this, store => store.listDocuments<Approval>('approval', scopeId));
}

function decideApproval(this: OpenControlRuntime, id: string, decision: ApprovalDecision): Approval {
  const previous = this.getApproval(id);
  if (!previous) throw new RuntimeError('NOT_FOUND', `Approval not found: ${id}`);
  if (previous.state !== 'pending') throw new RuntimeError('AUTHORIZATION_REQUIRED', `Approval is not pending: ${id}`);
  if (previous.requiredApproverKinds?.length && !previous.requiredApproverKinds.includes(decision.actor.kind as 'human' | 'agent' | 'service')) {
    throw new RuntimeError('AUTHORIZATION_REQUIRED', `Actor kind is not authorised for approval: ${decision.actor.kind}`);
  }
  const approval: Approval = { ...previous, state: decision.action === 'approve' ? 'approved' : 'rejected', decision };
  validateContract(SCHEMA_IDS.approval, approval);
  const scopeId = scopeForSubject(this, approval.subject.id);
  withStore(this, store => {
    store.putDocument({ kind: 'approval', id, scopeId: scopeId ?? null, document: approval });
    store.appendEvent('approval.decided', 'approval', id, scopeId ?? null, { action: decision.action, actorId: decision.actor.id, actorKind: decision.actor.kind });
  });
  this.appendAuditReceipt('approval.decided', { id, kind: 'approval' }, scopeId, { action: decision.action, actorId: decision.actor.id, actorKind: decision.actor.kind });
  return approval;
}

function applyApproval(this: OpenControlRuntime, id: string): { approval: Approval; workGraph: WorkGraph; checkpointId: string } {
  const approval = this.getApproval(id);
  if (!approval || approval.state !== 'approved' || approval.decision?.action !== 'approve') {
    throw new RuntimeError('AUTHORIZATION_REQUIRED', `Approved authorisation required: ${id}`);
  }
  const graph = this.listWorkGraphs().find(candidate => candidate.nodes.some(node => node.id === approval.subject.id && node.approvalRequired));
  if (!graph) throw new RuntimeError('AUTHORIZATION_REQUIRED', `Approval subject is not a protected pending work item: ${approval.subject.id}`);
  const checkpoint = this.createCheckpoint(graph.programmeId, `checkpoint.approval.${id}`);
  try {
    const next: WorkGraph = {
      ...graph,
      revision: graph.revision + 1,
      nodes: graph.nodes.map(node => node.id === approval.subject.id ? { ...node, approvalRequired: false } : node),
      updatedAt: new Date().toISOString()
    };
    const workGraph = this.putWorkGraph(next);
    const consumed: Approval = { ...approval, state: 'consumed' };
    validateContract(SCHEMA_IDS.approval, consumed);
    withStore(this, store => {
      store.putDocument({ kind: 'approval', id, scopeId: graph.programmeId, document: consumed });
      store.appendEvent('approval.consumed', 'approval', id, graph.programmeId, { subjectId: approval.subject.id, workGraphRevision: workGraph.revision, checkpointId: checkpoint.id });
    });
    this.appendAuditReceipt('approval.consumed', { id, kind: 'approval' }, graph.programmeId, { subjectId: approval.subject.id, workGraphRevision: workGraph.revision, checkpointId: checkpoint.id });
    return { approval: consumed, workGraph, checkpointId: checkpoint.id };
  } catch (error) {
    this.restoreCheckpoint(checkpoint.id);
    throw error;
  }
}

function recordEvidence(this: OpenControlRuntime, evidence: Evidence, scopeId?: string): Evidence {
  validateContract(SCHEMA_IDS.evidence, evidence);
  withStore(this, store => {
    if (store.getHeadRevision('evidence', evidence.id) !== undefined) throw new RuntimeError('CONFLICT', `Evidence is immutable once recorded: ${evidence.id}`);
    store.putDocument({ kind: 'evidence', id: evidence.id, scopeId: scopeId ?? null, document: evidence });
    store.appendEvent('evidence.recorded', 'evidence', evidence.id, scopeId ?? null, { kind: evidence.kind, executionRef: evidence.executionRef, resultRef: evidence.resultRef, hasDigest: Boolean(evidence.contentDigest) });
  });
  this.appendAuditReceipt('evidence.recorded', { id: evidence.id, kind: 'evidence' }, scopeId, { kind: evidence.kind, executionRef: evidence.executionRef, resultRef: evidence.resultRef, contentDigest: evidence.contentDigest });
  return evidence;
}

function getEvidence(this: OpenControlRuntime, id: string): Evidence | undefined {
  return withStore(this, store => store.getDocument<Evidence>('evidence', id));
}

function listEvidence(this: OpenControlRuntime, scopeId?: string): Evidence[] {
  return withStore(this, store => store.listDocuments<Evidence>('evidence', scopeId));
}

function appendAuditReceipt(this: OpenControlRuntime, eventType: string, subject: { id: string; kind?: string }, scopeId?: string, metadata?: Record<string, unknown>): AuditReceipt {
  const receipt = withAudit(this, store => store.append(eventType, subject, scopeId, metadata));
  validateContract(SCHEMA_IDS.auditReceipt, receipt);
  return receipt;
}

function listAuditReceipts(this: OpenControlRuntime): AuditReceipt[] {
  return withAudit(this, store => store.list());
}

function verifyAuditChain(this: OpenControlRuntime): AuditVerification {
  return withAudit(this, store => store.verify());
}

function reconcileInterruptedAssignments(this: OpenControlRuntime, programmeId?: string): { assignments: WorkAssignment[]; workGraphs: WorkGraph[] } {
  const running = this.listWorkAssignments(programmeId).filter(assignment => assignment.status === 'running');
  if (running.length === 0) return { assignments: [], workGraphs: [] };
  const now = new Date().toISOString();
  const recoveredAssignments: WorkAssignment[] = [];
  const changedGraphs: WorkGraph[] = [];
  const byProgramme = new Map<string, WorkAssignment[]>();
  for (const assignment of running) byProgramme.set(assignment.programmeId, [...(byProgramme.get(assignment.programmeId) ?? []), assignment]);

  for (const [programme, assignments] of byProgramme) {
    const graph = this.listWorkGraphs(programme)[0];
    const checkpoint = graph ? this.createCheckpoint(programme, `checkpoint.recovery.${programme}.${Date.now()}`) : undefined;
    try {
      withStore(this, store => {
        for (const assignment of assignments) {
          const interrupted: WorkAssignment = { ...assignment, status: 'interrupted', errorCode: 'RUNTIME_INTERRUPTED', updatedAt: now };
          validateContract(SCHEMA_IDS.workAssignment, interrupted);
          store.putDocument({ kind: 'work-assignment', id: interrupted.id, scopeId: programme, document: interrupted });
          store.appendEvent('recovery.assignment.interrupted', 'work-assignment', interrupted.id, programme, { workItemId: interrupted.workItemId });
          recoveredAssignments.push(interrupted);
        }
      });
      if (graph) {
        const runningIds = new Set(assignments.map(assignment => assignment.workItemId));
        const next: WorkGraph = {
          ...graph,
          revision: graph.revision + 1,
          nodes: graph.nodes.map(node => runningIds.has(node.id) && node.status === 'running' ? { ...node, status: 'blocked' as const } : node),
          updatedAt: now
        };
        changedGraphs.push(this.putWorkGraph(next));
      }
      this.appendAuditReceipt('recovery.interrupted', { id: programme, kind: 'programme' }, programme, { assignmentIds: assignments.map(assignment => assignment.id), checkpointId: checkpoint?.id });
    } catch (error) {
      if (checkpoint) this.restoreCheckpoint(checkpoint.id);
      throw error;
    }
  }
  return { assignments: recoveredAssignments, workGraphs: changedGraphs };
}

Object.assign(OpenControlRuntime.prototype, {
  requestApproval,
  getApproval,
  listApprovals,
  decideApproval,
  applyApproval,
  recordEvidence,
  getEvidence,
  listEvidence,
  appendAuditReceipt,
  listAuditReceipts,
  verifyAuditChain,
  reconcileInterruptedAssignments
});

export { CONTRACT_VERSION };
