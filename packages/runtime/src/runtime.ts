import { CONTRACT_VERSION, SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { AdapterEndpoint, AdapterManifest, BrowserActionBatch, BrowserBatchResult, BrowserEndpoint, CapabilityDescriptor, DesktopEndpoint, Checkpoint, DiscoveryManifest, ExecutionRequest, ExecutionResult, Mission, ModelEndpoint, ModelRequest, ModelResponse, Programme, ReplanEvent, WorkGraph, WorkNode } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { assertSafeAdapterEndpoint } from './adapter-security.js';
import { assertSafeBrowserEndpoint } from './browser-security.js';
import { assertSafeDesktopEndpoint } from './desktop-security.js';
import { BrowserSessionManager, type BrowserBackend, type BrowserSessionHandle } from './browser-backend.js';
import { createDefaultBrowserBackendRegistry } from './playwright-browser.js';
import type { AdapterTransport } from './adapter-transport.js';
import { AdapterTransportRegistry } from './adapter-transport.js';
import type { AdapterTransportContext } from './adapter-transport.js';
import { createDefaultAdapterTransportRegistry } from './adapter-protocols.js';
import { discoverManifest, type DiscoveryContext, type DiscoveryResult } from './discovery.js';
import { assertSafeEndpointConfiguration } from './model-security.js';
import { createDefaultModelTransportRegistry } from './model-protocols.js';
import type { ModelTransport, ModelTransportContext } from './model-transport.js';
import { ModelTransportRegistry } from './model-transport.js';
import { validateGraphStructure } from './graph-validation.js';
import { assertNextContractRevision, assertTransition } from './lifecycle.js';
import { validateContract } from './schema-loader.js';
import { SqliteStore } from './store.js';

export interface RuntimeOpenOptions {
  home?: string;
}


export interface RuntimeStatus {
  contractVersion: typeof CONTRACT_VERSION;
  home: string;
  databasePath: string;
  programmeId?: string;
  counts: {
    missions: number;
    programmes: number;
    workGraphs: number;
    executionRequestsPending: number;
    executionResults: number;
    checkpoints: number;
    capabilities: number;
    adapters: number;
    modelEndpoints: number;
    adapterEndpoints: number;
    browserEndpoints: number;
    desktopEndpoints: number;
  };
}

export class OpenControlRuntime {
  readonly home: string;
  readonly databasePath: string;
  private readonly store: SqliteStore;
  private readonly modelTransports: ModelTransportRegistry;
  private readonly adapterTransports: AdapterTransportRegistry;
  private readonly browserSessions: BrowserSessionManager;

  private constructor(store: SqliteStore, modelTransports: ModelTransportRegistry, adapterTransports: AdapterTransportRegistry, browserSessions: BrowserSessionManager) {
    this.store = store;
    this.modelTransports = modelTransports;
    this.adapterTransports = adapterTransports;
    this.browserSessions = browserSessions;
    this.home = store.home;
    this.databasePath = store.databasePath;
  }

  static open(options: RuntimeOpenOptions = {}): OpenControlRuntime {
    return new OpenControlRuntime(SqliteStore.open(options.home), createDefaultModelTransportRegistry(), createDefaultAdapterTransportRegistry(), new BrowserSessionManager(createDefaultBrowserBackendRegistry()));
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

  putCapability(capability: CapabilityDescriptor): CapabilityDescriptor {
    validateContract(SCHEMA_IDS.capability, capability);
    this.store.putDocument({ kind: 'capability', id: capability.id, scopeId: null, document: capability });
    this.store.appendEvent('registry.capability.put', 'capability', capability.id, null, { availability: capability.availability.state });
    return capability;
  }

  getCapability(id: string): CapabilityDescriptor | undefined {
    return this.store.getDocument<CapabilityDescriptor>('capability', id);
  }

  listCapabilities(): CapabilityDescriptor[] {
    return this.store.listDocuments<CapabilityDescriptor>('capability');
  }

  putAdapterManifest(manifest: AdapterManifest): AdapterManifest {
    validateContract(SCHEMA_IDS.adapterManifest, manifest);
    const missing = manifest.capabilityIds.filter(id => !this.getCapability(id));
    if (missing.length > 0) {
      throw new RuntimeError('INVALID_REFERENCE', `Adapter capability not found: ${missing.join(', ')}`);
    }
    this.store.putDocument({ kind: 'adapter-manifest', id: manifest.id, scopeId: null, document: manifest });
    this.store.appendEvent('registry.adapter.put', 'adapter-manifest', manifest.id, null, { capabilityIds: manifest.capabilityIds });
    return manifest;
  }

  getAdapterManifest(id: string): AdapterManifest | undefined {
    return this.store.getDocument<AdapterManifest>('adapter-manifest', id);
  }

  listAdapterManifests(): AdapterManifest[] {
    return this.store.listDocuments<AdapterManifest>('adapter-manifest');
  }

  putModelEndpoint(endpoint: ModelEndpoint): ModelEndpoint {
    validateContract(SCHEMA_IDS.modelEndpoint, endpoint);
    assertSafeEndpointConfiguration(endpoint);
    this.store.putDocument({ kind: 'model-endpoint', id: endpoint.id, scopeId: null, document: endpoint });
    this.store.appendEvent('model.endpoint.put', 'model-endpoint', endpoint.id, null, { protocol: endpoint.protocol, adapterKind: endpoint.adapterKind });
    return endpoint;
  }

  getModelEndpoint(id: string): ModelEndpoint | undefined {
    return this.store.getDocument<ModelEndpoint>('model-endpoint', id);
  }

  listModelEndpoints(): ModelEndpoint[] {
    return this.store.listDocuments<ModelEndpoint>('model-endpoint');
  }

  putBrowserEndpoint(endpoint: BrowserEndpoint): BrowserEndpoint {
    validateContract(SCHEMA_IDS.browserEndpoint, endpoint);
    assertSafeBrowserEndpoint(endpoint);
    this.store.putDocument({ kind: 'browser-endpoint', id: endpoint.id, scopeId: null, document: endpoint });
    this.store.appendEvent('browser.endpoint.put', 'browser-endpoint', endpoint.id, null, { backend: endpoint.backend, mode: endpoint.mode });
    return endpoint;
  }

  getBrowserEndpoint(id: string): BrowserEndpoint | undefined {
    return this.store.getDocument<BrowserEndpoint>('browser-endpoint', id);
  }

  listBrowserEndpoints(): BrowserEndpoint[] {
    return this.store.listDocuments<BrowserEndpoint>('browser-endpoint');
  }

  putDesktopEndpoint(endpoint: DesktopEndpoint): DesktopEndpoint {
    validateContract(SCHEMA_IDS.desktopEndpoint, endpoint);
    assertSafeDesktopEndpoint(endpoint);
    this.store.putDocument({ kind: 'desktop-endpoint', id: endpoint.id, scopeId: null, document: endpoint });
    this.store.appendEvent('desktop.endpoint.put', 'desktop-endpoint', endpoint.id, null, { backend: endpoint.backend, platforms: endpoint.platforms });
    return endpoint;
  }

  getDesktopEndpoint(id: string): DesktopEndpoint | undefined {
    return this.store.getDocument<DesktopEndpoint>('desktop-endpoint', id);
  }

  listDesktopEndpoints(): DesktopEndpoint[] {
    return this.store.listDocuments<DesktopEndpoint>('desktop-endpoint');
  }

  registerBrowserBackend(backend: BrowserBackend): void {
    this.browserSessions.registerBackend(backend);
  }

  async openBrowserSession(endpointId: string): Promise<BrowserSessionHandle> {
    const endpoint = this.getBrowserEndpoint(endpointId);
    if (!endpoint) throw new RuntimeError('INVALID_REFERENCE', `Browser endpoint not found: ${endpointId}`);
    const handle = await this.browserSessions.openSession(endpoint);
    this.store.appendEvent('browser.session.open', 'browser-endpoint', endpoint.id, null, { backend: endpoint.backend, mode: endpoint.mode });
    return handle;
  }

  async executeBrowserSession(sessionId: string, batch: BrowserActionBatch, signal?: AbortSignal): Promise<BrowserBatchResult> {
    validateContract(SCHEMA_IDS.browserActionBatch, batch);
    const handle = this.browserSessions.getSession(sessionId);
    if (!handle) throw new RuntimeError('NOT_FOUND', `Browser session not found: ${sessionId}`);
    const started = Date.now();
    const result = await this.browserSessions.execute(sessionId, batch, signal);
    this.store.appendEvent('browser.execute', 'browser-endpoint', handle.endpointId, null, {
      backend: handle.backend, actionCount: batch.actions.length, status: result.status, durationMs: Date.now() - started
    });
    return result;
  }

  async closeBrowserSession(sessionId: string): Promise<void> {
    const handle = this.browserSessions.getSession(sessionId);
    if (!handle) throw new RuntimeError('NOT_FOUND', `Browser session not found: ${sessionId}`);
    await this.browserSessions.closeSession(sessionId);
    this.store.appendEvent('browser.session.close', 'browser-endpoint', handle.endpointId, null, { backend: handle.backend });
  }

  async runBrowserBatch(endpointId: string, batch: BrowserActionBatch, signal?: AbortSignal): Promise<BrowserBatchResult> {
    const handle = await this.openBrowserSession(endpointId);
    try {
      return await this.executeBrowserSession(handle.id, batch, signal);
    } finally {
      if (this.browserSessions.getSession(handle.id)) await this.closeBrowserSession(handle.id);
    }
  }

  discoverBrowserCapability(endpointId: string): CapabilityDescriptor {
    const endpoint = this.getBrowserEndpoint(endpointId);
    if (!endpoint) throw new RuntimeError('INVALID_REFERENCE', `Browser endpoint not found: ${endpointId}`);
    const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    const capability: CapabilityDescriptor = {
      contractVersion: CONTRACT_VERSION,
      id: `capability.${endpoint.id}`,
      name: `${endpoint.name} browser control`,
      adapterKind: 'browser-control',
      operations: ['navigate','inspect','extract','click','type','keyboard','mouse','upload','download','screenshot'],
      modalities: { input: ['text','structured-data','control'], output: ['text','image','structured-data','binary'] },
      availability: { state: this.browserSessions.hasBackend(endpoint.backend) ? 'available' : 'offline', checkedAt: new Date().toISOString() },
      cost: { class: 'no-usage-fee' },
      privacy: { executionLocation: endpoint.mode === 'cdp' ? 'browser-session' : 'local', dataRetention: 'session' },
      trust: { level: 'configured', source: `browser-endpoint:${endpoint.id}` },
      platforms: [platform]
    };
    this.putCapability(capability);
    this.store.appendEvent('browser.discover', 'browser-endpoint', endpoint.id, null, { backend: endpoint.backend, availability: capability.availability.state });
    return capability;
  }

  putAdapterEndpoint(endpoint: AdapterEndpoint): AdapterEndpoint {
    validateContract(SCHEMA_IDS.adapterEndpoint, endpoint);
    assertSafeAdapterEndpoint(endpoint);
    this.store.putDocument({ kind: 'adapter-endpoint', id: endpoint.id, scopeId: null, document: endpoint });
    this.store.appendEvent('adapter.endpoint.put', 'adapter-endpoint', endpoint.id, null, { protocol: endpoint.protocol, adapterKind: endpoint.adapterKind });
    return endpoint;
  }

  getAdapterEndpoint(id: string): AdapterEndpoint | undefined {
    return this.store.getDocument<AdapterEndpoint>('adapter-endpoint', id);
  }

  listAdapterEndpoints(): AdapterEndpoint[] {
    return this.store.listDocuments<AdapterEndpoint>('adapter-endpoint');
  }

  registerAdapterTransport(transport: AdapterTransport): void {
    this.adapterTransports.register(transport);
  }

  async executeAdapter(endpointId: string, request: ExecutionRequest, context: AdapterTransportContext = {}): Promise<ExecutionResult> {
    validateContract(SCHEMA_IDS.executionRequest, request);
    const endpoint = this.getAdapterEndpoint(endpointId);
    if (!endpoint) throw new RuntimeError('INVALID_REFERENCE', `Adapter endpoint not found: ${endpointId}`);
    const startedAt = Date.now();
    try {
      const result = await this.adapterTransports.execute(endpoint, request, context);
      validateContract(SCHEMA_IDS.executionResult, result);
      if (result.requestId !== request.id || result.workItemId !== request.workItemId) {
        throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Adapter transport returned mismatched execution references');
      }
      this.store.appendEvent('adapter.execute', 'adapter-endpoint', endpoint.id, null, {
        protocol: endpoint.protocol, status: result.status, durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      this.store.appendEvent('adapter.execute', 'adapter-endpoint', endpoint.id, null, {
        protocol: endpoint.protocol, status: 'failed', durationMs: Date.now() - startedAt,
        errorCode: error instanceof RuntimeError ? error.code : 'ADAPTER_TRANSPORT_ERROR'
      });
      throw error;
    }
  }

  async discoverAdapterCapabilities(endpointId: string, context: AdapterTransportContext = {}): Promise<CapabilityDescriptor[]> {
    const endpoint = this.getAdapterEndpoint(endpointId);
    if (!endpoint) throw new RuntimeError('INVALID_REFERENCE', `Adapter endpoint not found: ${endpointId}`);
    const capabilities = [...await this.adapterTransports.discover(endpoint, context)];
    for (const capability of capabilities) this.putCapability(capability);
    this.store.appendEvent('adapter.discover', 'adapter-endpoint', endpoint.id, null, {
      protocol: endpoint.protocol, capabilityCount: capabilities.length
    });
    return capabilities;
  }

  registerModelTransport(transport: ModelTransport): void {
    this.modelTransports.register(transport);
  }

  async invokeModel(request: ModelRequest, context: ModelTransportContext = {}): Promise<ModelResponse> {
    validateContract(SCHEMA_IDS.modelRequest, request);
    const endpoint = this.getModelEndpoint(request.endpointId);
    if (!endpoint) {
      throw new RuntimeError('INVALID_REFERENCE', `Model endpoint not found: ${request.endpointId}`);
    }
    const startedAt = Date.now();
    try {
      const response = await this.modelTransports.invoke(endpoint, request, context);
      validateContract(SCHEMA_IDS.modelResponse, response);
      if (response.requestId !== request.id || response.endpointId !== endpoint.id) {
        throw new RuntimeError('MODEL_TRANSPORT_ERROR', 'Model transport returned mismatched response references');
      }
      this.store.appendEvent('model.invoke', 'model-endpoint', endpoint.id, null, {
        protocol: endpoint.protocol, status: 'succeeded', durationMs: Date.now() - startedAt
      });
      return response;
    } catch (error) {
      this.store.appendEvent('model.invoke', 'model-endpoint', endpoint.id, null, {
        protocol: endpoint.protocol, status: 'failed', durationMs: Date.now() - startedAt,
        errorCode: error instanceof RuntimeError ? error.code : 'MODEL_TRANSPORT_ERROR'
      });
      throw error;
    }
  }

  async discover(manifest: DiscoveryManifest, context: DiscoveryContext = {}): Promise<DiscoveryResult> {
    validateContract(SCHEMA_IDS.discoveryManifest, manifest);
    const result = await discoverManifest(manifest, context);
    this.putCapability(result.capability);
    this.store.appendEvent('discovery.run', 'capability', result.capability.id, null, {
      manifestId: manifest.id,
      availability: result.capability.availability.state,
      probeKinds: result.probes.map(probe => probe.kind)
    });
    return result;
  }

  async discoverMany(manifests: DiscoveryManifest[], context: DiscoveryContext = {}): Promise<DiscoveryResult[]> {
    const results: DiscoveryResult[] = [];
    for (const manifest of manifests) results.push(await this.discover(manifest, context));
    return results;
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

  createCheckpoint(programmeId: string, checkpointId?: string): Checkpoint {
    const programme = this.getProgramme(programmeId);
    if (!programme) throw new RuntimeError('INVALID_REFERENCE', `Checkpoint programme not found: ${programmeId}`);
    const graphs = this.listWorkGraphs(programmeId);
    if (graphs.length !== 1) {
      throw new RuntimeError('CONFLICT', `Phase 2 checkpoints require exactly one current work graph for ${programmeId}`);
    }
    const graph = graphs[0];
    const id = checkpointId ?? `checkpoint.${programmeId}.${Date.now().toString(36)}`;
    if (this.store.getCheckpoint(id)) throw new RuntimeError('CONFLICT', `Checkpoint already exists: ${id}`);
    const checkpoint: Checkpoint = {
      contractVersion: CONTRACT_VERSION,
      id,
      programmeId,
      workGraphRevision: graph.revision,
      resumableNodeIds: graph.nodes.filter(node => !['completed', 'cancelled'].includes(node.status)).map(node => node.id),
      stateRefs: [{ id: programme.id, kind: 'programme' }, { id: graph.id, kind: 'work-graph' }],
      createdAt: new Date().toISOString()
    };
    validateContract(SCHEMA_IDS.checkpoint, checkpoint);
    const snapshot = this.store.captureScopeHeads(programmeId);
    this.store.saveCheckpoint(id, programmeId, checkpoint, snapshot);
    this.store.appendEvent('checkpoint.create', 'checkpoint', id, programmeId, { workGraphRevision: graph.revision });
    return checkpoint;
  }

  listCheckpoints(programmeId?: string): Checkpoint[] {
    return this.store.listCheckpoints<Checkpoint>(programmeId);
  }

  restoreCheckpoint(checkpointId: string): Checkpoint {
    const stored = this.store.getCheckpoint<Checkpoint>(checkpointId);
    if (!stored) throw new RuntimeError('CHECKPOINT_NOT_FOUND', `Checkpoint not found: ${checkpointId}`);
    this.store.restoreScopeHeads(stored.checkpoint.programmeId, stored.snapshot);
    this.store.appendEvent('checkpoint.restore', 'checkpoint', checkpointId, stored.checkpoint.programmeId, {
      workGraphRevision: stored.checkpoint.workGraphRevision
    });
    return stored.checkpoint;
  }

  getStatus(programmeId?: string): RuntimeStatus {
    const programmes = programmeId ? [this.getProgramme(programmeId)].filter(Boolean) as Programme[] : this.listProgrammes();
    const missionIds = new Set(programmes.map(programme => programme.missionId));
    const missions = programmeId ? this.listMissions().filter(mission => missionIds.has(mission.id)) : this.listMissions();
    const graphs = programmeId ? this.listWorkGraphs(programmeId) : this.listWorkGraphs();
    const requests = programmeId ? this.listExecutionRequests(programmeId) : this.listExecutionRequests();
    const results = programmeId ? this.listExecutionResults(programmeId) : this.listExecutionResults();
    const completedRequestIds = new Set(results.map(result => result.requestId));
    return {
      contractVersion: CONTRACT_VERSION,
      home: this.home,
      databasePath: this.databasePath,
      ...(programmeId ? { programmeId } : {}),
      counts: {
        missions: missions.length,
        programmes: programmes.length,
        workGraphs: graphs.length,
        executionRequestsPending: requests.filter(request => !completedRequestIds.has(request.id)).length,
        executionResults: results.length,
        checkpoints: this.listCheckpoints(programmeId).length,
        capabilities: this.listCapabilities().length,
        adapters: this.listAdapterManifests().length,
        modelEndpoints: this.listModelEndpoints().length,
        adapterEndpoints: this.listAdapterEndpoints().length,
        browserEndpoints: this.listBrowserEndpoints().length,
        desktopEndpoints: this.listDesktopEndpoints().length
      }
    };
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
