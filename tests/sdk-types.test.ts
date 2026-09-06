import type {
  AdapterManifest,
  CapabilityAdapter,
  CapabilityDescriptor,
  ExecutionRequest,
  ExecutionResult,
  Mission,
  DiscoveryManifest,
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
