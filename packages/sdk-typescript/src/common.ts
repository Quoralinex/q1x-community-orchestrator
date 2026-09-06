export type ContractVersion = "1.0.0";
export type Identifier = string;
export type Timestamp = string;

export interface Reference {
  id: Identifier;
  kind?: string;
  uri?: string;
}

export type ActorKind = "human" | "agent" | "service" | "device" | "system";
export interface Actor {
  id: Identifier;
  kind: ActorKind;
  displayName?: string;
}

export type Modality = "text" | "image" | "audio" | "video" | "document" | "structured-data" | "code" | "binary" | "sensor-data" | "control";
export type Platform = "any" | "macos" | "windows" | "linux" | "web" | "container" | "mobile" | "embedded";
export type CostClass = "no-usage-fee" | "free-tier" | "metered" | "subscription" | "unknown";
export type PrivacyLevel = "local" | "private-network" | "managed-cloud" | "public-cloud" | "browser-session" | "unknown";
export type TrustLevel = "unverified" | "discovered" | "configured" | "validated" | "trusted";
export type AvailabilityState = "unknown" | "available" | "degraded" | "busy" | "offline" | "disabled";
