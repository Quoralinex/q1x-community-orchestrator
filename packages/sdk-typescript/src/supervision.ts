import type { AdapterKind } from "@quoralinex/q1x-community-contracts";
import type { CapabilityDescriptor } from "./capability.js";
import type { ExecutionRequirements } from "./execution.js";
import type { ContractVersion, Identifier, PrivacyLevel, Reference, Timestamp, TrustLevel } from "./common.js";
import type { Programme } from "./programme.js";
import type { WorkGraph } from "./work-graph.js";

export type ExecutorKind = "model-endpoint" | "adapter-endpoint" | "browser-endpoint" | "desktop-endpoint" | "external";

export interface ExecutionBinding {
  contractVersion: ContractVersion;
  id: Identifier;
  capabilityId: Identifier;
  executorKind: ExecutorKind;
  endpointId?: Identifier;
  operations: string[];
  enabled: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface CapabilityCandidate {
  capability: CapabilityDescriptor;
  binding: ExecutionBinding;
}

export interface TeamMemberAlternate {
  capabilityId: Identifier;
  bindingId: Identifier;
}

export interface TeamMember {
  id: Identifier;
  role: string;
  capabilityId: Identifier;
  bindingId: Identifier;
  operations: string[];
  workItemIds: Identifier[];
  state: "planned" | "ready" | "running" | "blocked" | "completed" | "failed";
  alternates?: TeamMemberAlternate[];
}

export interface TeamPlan {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  workGraphId: Identifier;
  workGraphRevision: number;
  members: TeamMember[];
  status: "planned" | "active" | "completed" | "cancelled";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WorkAssignment {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  workGraphId: Identifier;
  workGraphRevision: number;
  workItemId: Identifier;
  teamPlanId: Identifier;
  teamMemberId: Identifier;
  bindingId: Identifier;
  capabilityId: Identifier;
  attempt: number;
  requirements: ExecutionRequirements;
  contextRefs?: Reference[];
  status: "planned" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted" | "blocked";
  resultRef?: Identifier;
  usage?: { cost?: number; currency?: string; durationMs?: number };
  errorCode?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SupervisionStopReason =
  | "completed"
  | "idle"
  | "blocked"
  | "approval-required"
  | "budget-exhausted"
  | "deadline-reached"
  | "replan-required"
  | "max-cycles"
  | "cancelled";

export interface SupervisionPolicy {
  contractVersion: ContractVersion;
  id: Identifier;
  maxConcurrentAssignments: number;
  maxAttemptsPerWorkItem: number;
  maxKnownCost?: number;
  currency?: string;
  deadlineAt?: Timestamp;
  allowedExecutionLocations?: PrivacyLevel[];
  minimumTrust?: TrustLevel;
  preferNoUsageFee?: boolean;
  preferLocal?: boolean;
  allowUnknownCost?: boolean;
  failureThresholdBeforeReplan?: number;
  checkpointEveryCycles?: number;
  plannerStrategyId?: Identifier;
  stopConditions: SupervisionStopReason[];
}

export interface SupervisionCycle {
  contractVersion: ContractVersion;
  id: Identifier;
  programmeId: Identifier;
  workGraphId: Identifier;
  workGraphRevision: number;
  sequence: number;
  status: "running" | "completed" | "failed" | "cancelled";
  readyWorkItemIds: Identifier[];
  assignmentIds: Identifier[];
  completedWorkItemIds: Identifier[];
  failedWorkItemIds: Identifier[];
  stopReason?: SupervisionStopReason;
  checkpointId?: Identifier;
  startedAt: Timestamp;
  finishedAt?: Timestamp;
}

export interface ProgrammeProposal {
  contractVersion: ContractVersion;
  id: Identifier;
  missionId: Identifier;
  programme: Programme;
  workGraph: WorkGraph;
  assumptions?: string[];
  rationale: string;
  plannerStrategyId: Identifier;
  proposedAt: Timestamp;
}

export interface ProgrammeProposalValidation {
  valid: boolean;
  errors: string[];
}

export interface AcceptedProgrammeProposal {
  proposalId: Identifier;
  programme: Programme;
  workGraph: WorkGraph;
  checkpointId?: Identifier;
}

export interface SupervisionRunResult {
  programmeId: Identifier;
  stopReason: SupervisionStopReason;
  cycles: SupervisionCycle[];
}

export interface TeamFormationOptions {
  policy: SupervisionPolicy;
}

export interface CapabilityRoutingRequirements extends ExecutionRequirements {
  adapterKinds?: AdapterKind[];
}
