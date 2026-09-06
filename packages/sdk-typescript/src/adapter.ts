import type { AdapterManifest, CapabilityDescriptor } from "./capability.js";
import type { ExecutionRequest, ExecutionResult } from "./execution.js";

export interface CapabilityAdapter {
  readonly manifest: AdapterManifest;
  discover(signal?: AbortSignal): Promise<readonly CapabilityDescriptor[]>;
  execute(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResult>;
}
