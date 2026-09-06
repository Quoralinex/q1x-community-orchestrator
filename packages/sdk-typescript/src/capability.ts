import type { AdapterKind } from "@quoralinex/q1x-community-contracts";
import type { AvailabilityState, ContractVersion, CostClass, Identifier, Modality, Platform, PrivacyLevel, Timestamp, TrustLevel } from "./common.js";

export interface CapabilityDescriptor {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  adapterKind: AdapterKind;
  operations: string[];
  modalities: { input: Modality[]; output: Modality[] };
  availability: { state: AvailabilityState; checkedAt: Timestamp; detail?: string };
  cost: { class: CostClass; currency?: string; unitCost?: number; unit?: string };
  privacy: { executionLocation: PrivacyLevel; dataRetention?: "none" | "session" | "provider-policy" | "configurable" | "unknown" };
  trust: { level: TrustLevel; validatedAt?: Timestamp; source?: string };
  platforms: Platform[];
  metadata?: Record<string, unknown>;
}

export interface AdapterManifest {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  version: string;
  adapterKind: AdapterKind;
  platforms: Platform[];
  capabilityIds: Identifier[];
  transport?: { protocol?: string; endpointTemplate?: string };
  configurationKeys?: string[];
  metadata?: Record<string, unknown>;
}

export type DiscoveryProbe =
  | { kind: "command"; names: string[]; versionArgs?: string[]; timeoutMs?: number; platforms?: Platform[] }
  | { kind: "path"; paths: string[]; platforms?: Platform[] }
  | { kind: "environment"; keys: string[]; match?: "any" | "all"; platforms?: Platform[] }
  | { kind: "http"; url: string; method?: "GET" | "HEAD"; acceptedStatus?: number[]; timeoutMs?: number; platforms?: Platform[] };

export type CapabilityTemplate = Omit<CapabilityDescriptor, "contractVersion" | "availability">;

export interface DiscoveryManifest {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  version: string;
  platforms: Platform[];
  activation: "any" | "all";
  probes: DiscoveryProbe[];
  capability: CapabilityTemplate;
  metadata?: Record<string, unknown>;
}
