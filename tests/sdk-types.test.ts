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
