import type { ContractVersion, Identifier } from "./common.js";

export type ExecutableAdapterKind = "mcp" | "a2a" | "cli-tui";

export interface AdapterEnvironmentMapping {
  name: string;
  environmentKey: string;
}

export interface AdapterCredentialHeader {
  header: string;
  environmentKey: string;
  prefix?: string;
}

export interface AdapterStdioTransport {
  kind: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  inputMode?: "json" | "text" | "none";
  outputMode?: "json" | "text";
  environment?: AdapterEnvironmentMapping[];
}
export interface AdapterHttpTransport {
  kind: "http";
  url: string;
  timeoutMs?: number;
  staticHeaders?: Record<string, string>;
  credentials?: AdapterCredentialHeader[];
}

export interface AdapterEndpoint {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  adapterKind: ExecutableAdapterKind;
  protocol: string;
  capabilityIds?: Identifier[];
  transport: AdapterStdioTransport | AdapterHttpTransport;
  metadata?: Record<string, unknown>;
}
