import type { ContractVersion, Identifier } from "./common.js";

export interface DeploymentProfile {
  contractVersion: ContractVersion;
  id: Identifier;
  class: "personal" | "team" | "distributed";
  persistence: {
    state: "embedded" | "external";
    artifacts: "filesystem" | "s3-compatible" | "external" | "none";
  };
  coordination: "inline" | "database" | "distributed";
  networkMode: "local-only" | "lan" | "internet";
  workerConcurrency: number;
  minimumResources?: { cpuCores?: number; memoryMb?: number; storageMb?: number };
  metadata?: Record<string, unknown>;
}
