import type { AdapterKind } from "@quoralinex/q1x-community-contracts";
import type { ContractVersion, Identifier, Modality, PrivacyLevel, Reference, Timestamp, TrustLevel } from "./common.js";

export interface ExecutionRequirements {
  operations: string[];
  adapterKinds?: AdapterKind[];
  inputModalities?: Modality[];
  outputModalities?: Modality[];
  localOnly?: boolean;
  minimumTrust?: TrustLevel;
}

export interface ExecutionPolicy {
  timeoutSeconds?: number;
  maxAttempts?: number;
  maxCost?: number;
  currency?: string;
  privacy?: PrivacyLevel;
}

export interface ExecutionRequest {
  contractVersion: ContractVersion;
  id: Identifier;
  workItemId: Identifier;
  requirements: ExecutionRequirements;
  input: unknown;
  contextRefs?: Reference[];
  policy?: ExecutionPolicy;
  createdAt: Timestamp;
}

export interface ExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface ExecutionResult {
  contractVersion: ContractVersion;
  id: Identifier;
  requestId: Identifier;
  workItemId: Identifier;
  status: "succeeded" | "failed" | "cancelled" | "partial";
  output?: unknown;
  artifactRefs?: Identifier[];
  evidenceRefs?: Identifier[];
  usage?: { inputUnits?: number; outputUnits?: number; cost?: number; currency?: string; durationMs?: number };
  error?: ExecutionError;
  startedAt: Timestamp;
  finishedAt: Timestamp;
}
