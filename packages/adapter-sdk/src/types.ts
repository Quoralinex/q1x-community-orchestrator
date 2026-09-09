import type {
  AdapterEndpoint,
  CapabilityDescriptor,
  ExecutionRequest,
  ExecutionResult,
} from '@quoralinex/q1x-community-sdk';

export type AdapterSdkVersion = '0.1.0-alpha.2';

export interface AdapterCompatibility {
  sdkVersion: AdapterSdkVersion;
  contractVersion: '1.0.0';
  runtimeRange: '0.1.x';
}

export interface CommunityAdapterContext {
  signal?: AbortSignal;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
}

export interface CommunityAdapter {
  readonly protocol: string;
  readonly compatibility: AdapterCompatibility;
  execute(
    endpoint: AdapterEndpoint,
    request: ExecutionRequest,
    context?: CommunityAdapterContext,
  ): Promise<ExecutionResult>;
  discover?(
    endpoint: AdapterEndpoint,
    context?: CommunityAdapterContext,
  ): Promise<readonly CapabilityDescriptor[]>;
}

export interface AdapterValidationIssue {
  field: string;
  message: string;
}

export interface AdapterValidationResult {
  ok: boolean;
  issues: AdapterValidationIssue[];
}

export type AdapterSdkErrorCode = 'INVALID_ADAPTER' | 'INCOMPATIBLE_ADAPTER';

export type AdapterConformanceCheckName =
  | 'adapter-metadata'
  | 'execute-result'
  | 'discover-result'
  | 'fixture-immutability';

export interface AdapterConformanceCheck {
  name: AdapterConformanceCheckName;
  ok: boolean;
  message?: string;
}

export interface AdapterConformanceOptions {
  endpoint: AdapterEndpoint;
  request: ExecutionRequest;
  signal?: AbortSignal;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
}

export interface AdapterConformanceReport {
  ok: boolean;
  protocol: string;
  checks: AdapterConformanceCheck[];
}
