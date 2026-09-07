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

const browserEndpoint: AdapterEndpoint = {
  contractVersion: "1.0.0",
  id: "adapter.browser.webdriver",
  name: "Local WebDriver",
  adapterKind: "browser-control",
  protocol: "webdriver-http-v1",
  transport: { kind: "http", url: "http://127.0.0.1:4444" }
};

const desktopEndpoint: AdapterEndpoint = {
  contractVersion: "1.0.0",
  id: "adapter.desktop.bridge",
  name: "Desktop bridge",
  adapterKind: "desktop-control",
  protocol: "desktop-json-stdio-v1",
  transport: { kind: "stdio", command: "desktop-bridge", inputMode: "json", outputMode: "json" }
};

void phase5Endpoint; void browserEndpoint; void desktopEndpoint;
