import type {
  AdapterManifest,
  CapabilityAdapter,
  CapabilityDescriptor,
  ExecutionRequest,
  ExecutionResult,
  Mission,
  DiscoveryManifest,
  ModelEndpoint,
  ModelRequest,
  ModelResponse,
  AdapterEndpoint,
  BrowserEndpoint,
  BrowserActionBatch,
  BrowserBatchResult,
  DesktopEndpoint,
  DesktopActionBatch,
  DesktopBatchResult,
  Approval,
  ApprovalDecision,
  Evidence,
  AuditReceipt,
  AuditVerification,
} from "../packages/sdk-typescript/src/index.js";

const mission: Mission = {
  contractVersion: "1.0.0",
  id: "mission.sdk-test",
  title: "SDK contract test",
  objective: "Prove a consumer can type a non-provider-specific mission.",
  outcomes: [{ id: "outcome.sdk", description: "Types compile", successCriteria: ["tsc passes"] }],
  status: "active",
  createdAt: "2026-09-06T01:30:00Z",
};

const manifest: AdapterManifest = {
  contractVersion: "1.0.0",
  id: "adapter.test",
  name: "Test adapter",
  version: "0.1.0",
  adapterKind: "local-inference",
  platforms: ["linux"],
  capabilityIds: ["capability.test"],
};

const capability: CapabilityDescriptor = {
  contractVersion: "1.0.0",
  id: "capability.test",
  name: "Test capability",
  adapterKind: "local-inference",
  operations: ["reason"],
  modalities: { input: ["text"], output: ["text"] },
  availability: { state: "available", checkedAt: "2026-09-06T01:30:00Z" },
  cost: { class: "no-usage-fee" },
  privacy: { executionLocation: "local", dataRetention: "none" },
  trust: { level: "validated" },
  platforms: ["linux"],
};

const adapter: CapabilityAdapter = {
  manifest,
  async discover() { return [capability]; },
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    return {
      contractVersion: "1.0.0",
      id: "result.test",
      requestId: request.id,
      workItemId: request.workItemId,
      status: "succeeded",
      startedAt: request.createdAt,
      finishedAt: request.createdAt,
    };
  },
};

void mission;
void adapter;

const discoveryManifest: DiscoveryManifest = {
  contractVersion: "1.0.0",
  id: "discovery.test-cli",
  name: "Test CLI discovery",
  version: "1.0.0",
  platforms: ["linux", "macos", "windows"],
  activation: "any",
  probes: [{ kind: "command", names: ["test-cli"], versionArgs: ["--version"] }],
  capability: {
    id: "capability.test-cli",
    name: "Test CLI",
    adapterKind: "cli-tui",
    operations: ["execute"],
    modalities: { input: ["text"], output: ["text"] },
    cost: { class: "no-usage-fee" },
    privacy: { executionLocation: "local" },
    trust: { level: "unverified" },
    platforms: ["linux", "macos", "windows"],
  },
};
void discoveryManifest;

const endpoint: ModelEndpoint = {
  contractVersion: "1.0.0", id: "endpoint.local", name: "Local endpoint",
  adapterKind: "local-inference", protocol: "openai-chat-completions",
  url: "http://127.0.0.1:1234/v1/chat/completions", defaultModel: "local-model"
};
const modelRequest: ModelRequest = {
  contractVersion: "1.0.0", id: "model.request.test", endpointId: endpoint.id,
  messages: [{ role: "user", content: "Hello" }], createdAt: "2026-09-06T03:00:00Z"
};
const modelResponse: ModelResponse = {
  contractVersion: "1.0.0", id: "model.response.test", requestId: modelRequest.id, endpointId: endpoint.id,
  outputText: "Hello", startedAt: "2026-09-06T03:00:00Z", finishedAt: "2026-09-06T03:00:01Z"
};
void endpoint; void modelRequest; void modelResponse;

const phase5Endpoint: AdapterEndpoint = {
  contractVersion: "1.0.0",
  id: "adapter.endpoint.test",
  name: "Portable CLI",
  adapterKind: "cli-tui",
  protocol: "cli-json-stdio",
  transport: { kind: "stdio", command: "node", args: ["worker.mjs"], inputMode: "json", outputMode: "json" }
};
void phase5Endpoint;

const browserEndpoint: BrowserEndpoint = {
  contractVersion: "1.0.0",
  id: "browser.endpoint.test",
  name: "Managed Chromium",
  backend: "playwright",
  mode: "managed",
  engine: "chromium",
  headless: true,
  timeoutMs: 30000
};
const browserBatch: BrowserActionBatch = {
  contractVersion: "1.0.0",
  id: "browser.batch.test",
  actions: [
    { id: "navigate", kind: "navigate", url: "https://example.com" },
    { id: "inspect", kind: "inspect" },
    { id: "click", kind: "click", target: { by: "role", role: "button", name: "Continue" } }
  ]
};
const browserResult: BrowserBatchResult = {
  contractVersion: "1.0.0",
  id: "browser.batch.test.result",
  batchId: browserBatch.id,
  status: "succeeded",
  finalUrl: "https://example.com",
  finalTitle: "Example",
  actions: [{ id: "navigate", status: "succeeded", durationMs: 10 }]
};
void browserEndpoint; void browserBatch; void browserResult;

const desktopEndpoint: DesktopEndpoint = {
  contractVersion: "1.0.0",
  id: "desktop.endpoint.test",
  name: "Portable desktop bridge",
  backend: "stdio-bridge",
  platform: "any",
  executionLocation: "local",
  supportedActions: ["focus-application", "inspect", "click"],
  transport: { command: "node", args: ["bridge.mjs"], timeoutMs: 30000 },
  applicationPolicy: { allowedApplications: ["example.app"] },
  outputDir: "./desktop-output"
};
const desktopBatch: DesktopActionBatch = {
  contractVersion: "1.0.0",
  id: "desktop.batch.test",
  actions: [
    { id: "focus", kind: "focus-application", application: "example.app" },
    { id: "inspect", kind: "inspect" },
    { id: "click", kind: "click", target: { by: "role", role: "button", name: "Continue" } }
  ]
};
const desktopResult: DesktopBatchResult = {
  contractVersion: "1.0.0",
  id: "desktop.batch.test.result",
  batchId: desktopBatch.id,
  status: "succeeded",
  actions: [{ id: "focus", status: "succeeded", durationMs: 5 }]
};
void desktopEndpoint; void desktopBatch; void desktopResult;

const approvalDecision: ApprovalDecision = {
  actor: { id: "human.owner", kind: "human" },
  action: "approve",
  decidedAt: "2026-09-08T10:01:00Z",
  reason: "Reviewed."
};
const approval: Approval = {
  contractVersion: "1.0.0",
  id: "approval.sdk-test",
  subject: { id: "task.sdk-protected", kind: "task" },
  state: "consumed",
  requestedAt: "2026-09-08T10:00:00Z",
  requestedBy: { id: "agent.supervisor", kind: "agent" },
  requiredApproverKinds: ["human"],
  decision: approvalDecision
};
const evidence: Evidence = {
  contractVersion: "1.0.0",
  id: "evidence.sdk-test",
  kind: "test-result",
  summary: "Typed evidence",
  executionRef: "execution.sdk-test",
  resultRef: "result.sdk-test",
  contentDigest: { algorithm: "sha256", value: "a".repeat(64) },
  provenance: { actor: { id: "service.ci", kind: "service" }, method: "node-test" },
  collectedAt: "2026-09-08T10:02:00Z"
};
const auditReceipt: AuditReceipt = {
  contractVersion: "1.0.0",
  id: "audit.1.sdk-test",
  sequence: 1,
  eventType: "approval.requested",
  subject: { id: approval.id, kind: "approval" },
  scopeId: "programme.sdk-test",
  digest: `sha256:${"b".repeat(64)}`,
  occurredAt: "2026-09-08T10:00:00Z"
};
const auditVerification: AuditVerification = { valid: true, checked: 1 };
void approvalDecision; void approval; void evidence; void auditReceipt; void auditVerification;
