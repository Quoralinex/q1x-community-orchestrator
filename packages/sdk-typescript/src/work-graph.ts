import type { AdapterKind } from "@quoralinex/q1x-community-contracts";
import type { ContractVersion, Identifier, Modality, Timestamp } from "./common.js";

export interface CapabilityRequirement {
  operation: string;
  adapterKinds?: AdapterKind[];
  inputModalities?: Modality[];
  outputModalities?: Modality[];
}

export interface WorkNode {
  id: Identifier;
  kind: "workstream" | "work-package" | "task" | "experiment" | "decision" | "milestone";
  title: string;
  description?: string;
  parentId?: Identifier;
  status: "pending" | "ready" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  capabilityRequirements?: CapabilityRequirement[];
  approvalRequired?: boolean;
}

export interface WorkEdge {
  from: Identifier;
  to: Identifier;
  type: "depends-on" | "blocks" | "produces" | "informs" | "invalidates";
}

export interface WorkGraph {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  revision: number;
  nodes: WorkNode[];
  edges: WorkEdge[];
  updatedAt: Timestamp;
}

export interface ReplanEvent {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  trigger: "evidence" | "failure" | "constraint-change" | "user-change" | "capability-change" | "dependency-change" | "other";
  rationale: string;
  invalidatedNodeIds?: Identifier[];
  createdNodeIds?: Identifier[];
  evidenceRefs?: Identifier[];
  occurredAt: Timestamp;
}
