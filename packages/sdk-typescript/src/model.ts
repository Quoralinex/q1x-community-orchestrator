import type { AdapterKind } from "@quoralinex/q1x-community-contracts";
import type { ContractVersion, Identifier, Timestamp } from "./common.js";

export interface ModelEndpointCredential { header: string; environmentKey: string; prefix?: string; }
export interface ModelEndpoint {
  contractVersion: ContractVersion; id: Identifier; name: string; adapterKind: AdapterKind;
  protocol: string; url: string; defaultModel: string; timeoutMs?: number;
  staticHeaders?: Record<string, string>; credentials?: ModelEndpointCredential[]; metadata?: Record<string, unknown>;
}
export interface ModelMessage { role: "system" | "user" | "assistant"; content: string; }
export interface ModelRequest {
  contractVersion: ContractVersion; id: Identifier; endpointId: Identifier; model?: string;
  messages: ModelMessage[]; temperature?: number; maxOutputTokens?: number; createdAt: Timestamp; metadata?: Record<string, unknown>;
}
export interface ModelResponse {
  contractVersion: ContractVersion; id: Identifier; requestId: Identifier; endpointId: Identifier; outputText: string;
  model?: string; usage?: { inputTokens?: number; outputTokens?: number }; finishReason?: string;
  startedAt: Timestamp; finishedAt: Timestamp; metadata?: Record<string, unknown>;
}
