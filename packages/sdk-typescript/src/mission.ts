import type { ContractVersion, Identifier, Timestamp } from "./common.js";

export interface MissionOutcome {
  id: Identifier;
  description: string;
  successCriteria: string[];
}

export interface Mission {
  contractVersion: ContractVersion;
  id: Identifier;
  title: string;
  objective: string;
  outcomes: MissionOutcome[];
  constraints?: Record<string, unknown>;
  tags?: string[];
  status: "proposed" | "active" | "paused" | "completed" | "cancelled";
  createdAt: Timestamp;
}
