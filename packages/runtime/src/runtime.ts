import { SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { ExecutionRequest, ExecutionResult, Mission, Programme, ReplanEvent, WorkGraph, WorkNode } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { validateGraphStructure } from './graph-validation.js';
import { assertNextContractRevision, assertTransition } from './lifecycle.js';
import { validateContract } from './schema-loader.js';
import { SqliteStore } from './store.js';

export interface RuntimeOpenOptions {
  home?: string;
}

export class OpenControlRuntime {
  readonly home: string;
  readonly databasePath: string;
  private readonly store: SqliteStore;

  private constructor(store: SqliteStore) {
    this.store = store;
    this.home = store.home;
    this.databasePath = store.databasePath;
  }

  static open(options: RuntimeOpenOptions = {}): OpenControlRuntime {
    return new OpenControlRuntime(SqliteStore.open(options.home));
  }

  close(): void {
    this.store.close();
  }

  putMission(mission: Mission): Mission {
    validateContract(SCHEMA_IDS.mission, mission);
    const previous = this.getMission(mission.id);
    if (previous) assertTransition('mission', previous.status, mission.status);
    this.store.putDocument({ kind: 'mission', id: mission.id, scopeId: null, document: mission });
    this.store.appendEvent('document.put', 'mission', mission.id, null, { status: mission.status });
    return mission;
  }

  getMission(id: string): Mission | undefined {
    return this.store.getDocument<Mission>('mission', id);
  }

  listMissions(): Mission[] {
    return this.store.listDocuments<Mission>('mission');
  }

  putProgramme(programme: Programme): Programme {
    validateContract(SCHEMA_IDS.programme, programme);
    if (!this.getMission(programme.missionId)) {
      throw new RuntimeError('INVALID_REFERENCE', `Programme mission not found: ${programme.missionId}`);
    }
    const previous = this.getProgramme(programme.id);
    if (previous?.missionId && previous.missionId !== programme.missionId) {
      throw new RuntimeError('CONFLICT', 'A programme cannot change its mission');
    }
    assertNextContractRevision(previous?.revision, programme.revision);
    if (previous) assertTransition('programme', previous.status, programme.status);
    this.store.putDocument({ kind: 'programme', id: programme.id, scopeId: programme.id, document: programme });
    this.store.appendEvent('document.put', 'programme', programme.id, programme.id, { revision: programme.revision });
    return programme;
  }

  getProgramme(id: string): Programme | undefined {
    return this.store.getDocument<Programme>('programme', id);
  }

  listProgrammes(): Programme[] {
    return this.store.listDocuments<Programme>('programme');
  }

  putWorkGraph(graph: WorkGraph): WorkGraph {
    validateContract(SCHEMA_IDS.workGraph, graph);
    const programme = this.getProgramme(graph.programmeId);
    if (!programme) {
      throw new RuntimeError('INVALID_REFERENCE', `Work graph programme not found: ${graph.programmeId}`);
    }
    validateGraphStructure(graph, programme.workstreams.map(workstream => workstream.id));
    const previous = this.getWorkGraph(graph.id);
    if (previous?.programmeId && previous.programmeId !== graph.programmeId) {
      throw new RuntimeError('CONFLICT', 'A work graph cannot change its programme');
    }
    assertNextContractRevision(previous?.revision, graph.revision);
    if (previous) this.assertWorkNodeTransitions(previous, graph);
    this.store.putDocument({ kind: 'work-graph', id: graph.id, scopeId: graph.programmeId, document: graph });
    this.store.appendEvent('document.put', 'work-graph', graph.id, graph.programmeId, { revision: graph.revision });
    return graph;
  }

  getWorkGraph(id: string): WorkGraph | undefined {
    return this.store.getDocument<WorkGraph>('work-graph', id);
  }

  listWorkGraphs(programmeId?: string): WorkGraph[] {
    return this.store.listDocuments<WorkGraph>('work-graph', programmeId);
  }

  recordReplanEvent(event: ReplanEvent): ReplanEvent {
    validateContract(SCHEMA_IDS.replanEvent, event);
    if (!this.getProgramme(event.programmeId)) {
      throw new RuntimeError('INVALID_REFERENCE', `Replan programme not found: ${event.programmeId}`);
    }
    if (this.store.getHeadRevision('replan-event', event.id) !== undefined) {
      throw new RuntimeError('CONFLICT', `Replan event already exists: ${event.id}`);
    }
    this.store.putDocument({ kind: 'replan-event', id: event.id, scopeId: event.programmeId, document: event });
    this.store.appendEvent('replan.record', 'replan-event', event.id, event.programmeId, { trigger: event.trigger });
    return event;
  }

  listReplanEvents(programmeId?: string): ReplanEvent[] {
    return this.store.listDocuments<ReplanEvent>('replan-event', programmeId);
  }

  recordExecutionRequest(request: ExecutionRequest): ExecutionRequest {
    validateContract(SCHEMA_IDS.executionRequest, request);
    if (this.getExecutionRequest(request.id)) {
      throw new RuntimeError('EXECUTION_CONFLICT', `Execution request already exists: ${request.id}`);
    }
    const located = this.findWorkItem(request.workItemId);
    if (!located) {
      throw new RuntimeError('INVALID_REFERENCE', `Execution work item not found: ${request.workItemId}`);
    }
    if (located.node.status === 'completed' || located.node.status === 'cancelled') {
      throw new RuntimeError('EXECUTION_CONFLICT', `Execution work item is terminal: ${request.workItemId}`);
    }
    this.store.putDocument({ kind: 'execution-request', id: request.id, scopeId: located.programmeId, document: request });
    this.store.appendEvent('execution.request', 'execution-request', request.id, located.programmeId, { workItemId: request.workItemId });
    return request;
  }

  getExecutionRequest(id: string): ExecutionRequest | undefined {
    return this.store.getDocument<ExecutionRequest>('execution-request', id);
  }

  listExecutionRequests(programmeId?: string): ExecutionRequest[] {
    return this.store.listDocuments<ExecutionRequest>('execution-request', programmeId);
  }

  recordExecutionResult(result: ExecutionResult): ExecutionResult {
    validateContract(SCHEMA_IDS.executionResult, result);
    const request = this.getExecutionRequest(result.requestId);
    if (!request) {
      throw new RuntimeError('INVALID_REFERENCE', `Execution request not found: ${result.requestId}`);
    }
    if (request.workItemId !== result.workItemId) {
      throw new RuntimeError('EXECUTION_CONFLICT', 'Execution result work item does not match its request');
    }
    if (this.getExecutionResult(result.requestId) || this.store.getHeadRevision('execution-result', result.id) !== undefined) {
      throw new RuntimeError('EXECUTION_CONFLICT', `Execution request already has a result: ${result.requestId}`);
    }
    const scopeId = this.store.getDocumentScope('execution-request', request.id);
    if (!scopeId) throw new RuntimeError('INVALID_REFERENCE', `Execution request has no programme scope: ${request.id}`);
    this.store.putDocument({ kind: 'execution-result', id: result.id, scopeId, document: result });
    this.store.appendEvent('execution.result', 'execution-result', result.id, scopeId, { requestId: result.requestId, status: result.status });
    return result;
  }

  getExecutionResult(requestId: string): ExecutionResult | undefined {
    return this.listExecutionResults().find(result => result.requestId === requestId);
  }

  listExecutionResults(programmeId?: string): ExecutionResult[] {
    return this.store.listDocuments<ExecutionResult>('execution-result', programmeId);
  }

  private findWorkItem(workItemId: string): { node: WorkNode; programmeId: string } | undefined {
    const matches = this.listWorkGraphs().flatMap(graph => {
      const node = graph.nodes.find(candidate => candidate.id === workItemId);
      return node ? [{ node, programmeId: graph.programmeId }] : [];
    });
    if (matches.length > 1) {
      throw new RuntimeError('CONFLICT', `Work item id is ambiguous across programmes: ${workItemId}`);
    }
    return matches[0];
  }

  private assertWorkNodeTransitions(previous: WorkGraph, next: WorkGraph): void {
    const previousById = new Map(previous.nodes.map(node => [node.id, node]));
    for (const node of next.nodes) {
      const prior = previousById.get(node.id);
      if (prior) assertTransition('work-node', prior.status, node.status);
    }
  }
}
