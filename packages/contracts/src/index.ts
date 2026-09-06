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
} as const;
