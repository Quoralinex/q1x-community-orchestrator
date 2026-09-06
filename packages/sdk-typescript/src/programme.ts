import type { ContractVersion, Identifier, Timestamp } from "./common.js";

export interface Workstream {
  id: Identifier;
  title: string;
  objective: string;
  status: "planned" | "active" | "blocked" | "completed" | "cancelled";
}

export interface Programme {
  contractVersion: ContractVersion;
  id: Identifier;
  missionId: Identifier;
  revision: number;
  status: "planned" | "active" | "paused" | "completed" | "cancelled";
  workstreams: Workstream[];
  assumptions?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
