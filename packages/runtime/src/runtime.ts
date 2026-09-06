import { SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { Mission, Programme, ReplanEvent, WorkGraph } from '@quoralinex/q1x-community-sdk';
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

  private assertWorkNodeTransitions(previous: WorkGraph, next: WorkGraph): void {
    const previousById = new Map(previous.nodes.map(node => [node.id, node]));
    for (const node of next.nodes) {
      const prior = previousById.get(node.id);
      if (prior) assertTransition('work-node', prior.status, node.status);
    }
  }
}
