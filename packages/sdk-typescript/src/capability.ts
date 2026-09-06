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
