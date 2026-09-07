export const CONTRACT_VERSION = "1.0.0" as const;

export const ADAPTER_KINDS = [
  "native-api",
  "provider-http",
  "openai-protocol",
  "anthropic-protocol",
  "local-inference",
  "mcp",
  "a2a",
  "cli-tui",
  "browser-control",
  "desktop-control",
  "software-runtime",
  "edge-device",
] as const;

export type AdapterKind = (typeof ADAPTER_KINDS)[number];

export const MODEL_PROTOCOLS = [
  "openai-chat-completions",
  "openai-responses",
  "anthropic-messages",
] as const;

export type BuiltInModelProtocol = (typeof MODEL_PROTOCOLS)[number];

export const SCHEMA_IDS = {
  common: "urn:q1x:community:contracts:v1:common",
  mission: "urn:q1x:community:contracts:v1:mission",
  programme: "urn:q1x:community:contracts:v1:programme",
  workGraph: "urn:q1x:community:contracts:v1:work-graph",
  replanEvent: "urn:q1x:community:contracts:v1:replan-event",
  capability: "urn:q1x:community:contracts:v1:capability",
  adapterManifest: "urn:q1x:community:contracts:v1:adapter-manifest",
  executionRequest: "urn:q1x:community:contracts:v1:execution-request",
  executionResult: "urn:q1x:community:contracts:v1:execution-result",
  evidence: "urn:q1x:community:contracts:v1:evidence",
  artifact: "urn:q1x:community:contracts:v1:artifact",
  approval: "urn:q1x:community:contracts:v1:approval",
  checkpoint: "urn:q1x:community:contracts:v1:checkpoint",
  deploymentProfile: "urn:q1x:community:contracts:v1:deployment-profile",
  discoveryManifest: "urn:q1x:community:contracts:v1:discovery-manifest",
  modelEndpoint: "urn:q1x:community:contracts:v1:model-endpoint",
  modelRequest: "urn:q1x:community:contracts:v1:model-request",
  modelResponse: "urn:q1x:community:contracts:v1:model-response",
  adapterEndpoint: "urn:q1x:community:contracts:v1:adapter-endpoint",
  browserEndpoint: "urn:q1x:community:contracts:v1:browser-endpoint",
  browserActionBatch: "urn:q1x:community:contracts:v1:browser-action-batch",
  desktopEndpoint: "urn:q1x:community:contracts:v1:desktop-endpoint",
  desktopActionBatch: "urn:q1x:community:contracts:v1:desktop-action-batch",
  executionBinding: "urn:q1x:community:contracts:v1:execution-binding",
  teamPlan: "urn:q1x:community:contracts:v1:team-plan",
  workAssignment: "urn:q1x:community:contracts:v1:work-assignment",
  programmeProposal: "urn:q1x:community:contracts:v1:programme-proposal",
  supervisionPolicy: "urn:q1x:community:contracts:v1:supervision-policy",
  supervisionCycle: "urn:q1x:community:contracts:v1:supervision-cycle",
} as const;
