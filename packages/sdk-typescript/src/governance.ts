import type { Actor, ContractVersion, Identifier, Reference, Timestamp } from "./common.js";

export interface Evidence {
  contractVersion: ContractVersion;
  id: Identifier;
  kind: "source" | "observation" | "test-result" | "simulation-result" | "review" | "measurement" | "citation" | "other";
  summary: string;
  sourceUri?: string;
  artifactRef?: Identifier;
  executionRef?: Identifier;
  resultRef?: Identifier;
  contentDigest?: { algorithm: "sha256" | "sha512"; value: string };
  claims?: string[];
  provenance?: { actor?: Actor; method?: string };
  collectedAt: Timestamp;
}

export interface Artifact {
  contractVersion: ContractVersion;
  id: Identifier;
  kind: "document" | "code" | "dataset" | "image" | "audio" | "video" | "model" | "archive" | "report" | "configuration" | "other";
  uri: string;
  mediaType?: string;
  checksum?: { algorithm: "sha256" | "sha512"; value: string };
  createdBy?: Actor;
  createdAt: Timestamp;
  metadata?: Record<string, unknown>;
}

export interface ApprovalDecision {
  actor: Actor;
  action: "approve" | "reject";
  decidedAt: Timestamp;
  reason?: string;
}

export interface Approval {
  contractVersion: ContractVersion;
  id: Identifier;
  subject: Reference;
  state: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  requestedAt: Timestamp;
  requestedBy: Actor;
  requiredApproverKinds?: ("human" | "agent" | "service")[];
  decision?: ApprovalDecision;
}

export interface Checkpoint {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  workGraphRevision: number;
  resumableNodeIds?: Identifier[];
  stateRefs?: Reference[];
  artifactRefs?: Identifier[];
  evidenceRefs?: Identifier[];
  createdAt: Timestamp;
}

export interface AuditReceipt {
  contractVersion: ContractVersion;
  id: Identifier;
  sequence: number;
  eventType: string;
  subject: Reference;
  scopeId?: Identifier;
  metadata?: Record<string, unknown>;
  previousDigest?: string;
  digest: string;
  occurredAt: Timestamp;
}

export interface AuditVerification {
  valid: boolean;
  checked: number;
  firstInvalidSequence?: number;
  expectedDigest?: string;
  actualDigest?: string;
}
