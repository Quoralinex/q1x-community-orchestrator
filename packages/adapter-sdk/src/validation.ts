import type {
  AdapterCompatibility,
  AdapterSdkErrorCode,
  AdapterValidationIssue,
  AdapterValidationResult,
  CommunityAdapter,
} from './types.js';

export const ADAPTER_SDK_VERSION = '0.1.0-alpha.1' as const;
export const ADAPTER_CONTRACT_VERSION = '1.0.0' as const;
export const ADAPTER_RUNTIME_RANGE = '0.1.x' as const;

const PROTOCOL_PATTERN = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;
const MAX_PROTOCOL_LENGTH = 64;

export class AdapterSdkError extends Error {
  readonly code: AdapterSdkErrorCode;
  readonly issues: readonly AdapterValidationIssue[];

  constructor(code: AdapterSdkErrorCode, message: string, issues: readonly AdapterValidationIssue[] = []) {
    super(message);
    this.name = 'AdapterSdkError';
    this.code = code;
    this.issues = issues;
  }
}

export function createAdapterCompatibility(): AdapterCompatibility {
  return {
    sdkVersion: ADAPTER_SDK_VERSION,
    contractVersion: ADAPTER_CONTRACT_VERSION,
    runtimeRange: ADAPTER_RUNTIME_RANGE,
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function issue(issues: AdapterValidationIssue[], field: string, message: string): void {
  issues.push({ field, message });
}

export function validateCommunityAdapter(adapter: unknown): AdapterValidationResult {
  const issues: AdapterValidationIssue[] = [];
  const value = objectValue(adapter);
  if (!value) {
    issue(issues, 'adapter', 'Adapter must be an object');
    return { ok: false, issues };
  }

  const protocol = value.protocol;
  if (typeof protocol !== 'string' || protocol.length === 0 || protocol.length > MAX_PROTOCOL_LENGTH || !PROTOCOL_PATTERN.test(protocol)) {
    issue(issues, 'protocol', `Protocol must match ${PROTOCOL_PATTERN.source} and be at most ${MAX_PROTOCOL_LENGTH} characters`);
  }

  if (typeof value.execute !== 'function') {
    issue(issues, 'execute', 'Adapter execute must be a function');
  }

  const compatibility = objectValue(value.compatibility);
  if (!compatibility) {
    issue(issues, 'compatibility', 'Adapter compatibility must be an object');
  } else {
    if (compatibility.sdkVersion !== ADAPTER_SDK_VERSION) {
      issue(issues, 'compatibility.sdkVersion', `SDK version must be ${ADAPTER_SDK_VERSION}`);
    }
    if (compatibility.contractVersion !== ADAPTER_CONTRACT_VERSION) {
      issue(issues, 'compatibility.contractVersion', `Contract version must be ${ADAPTER_CONTRACT_VERSION}`);
    }
    if (compatibility.runtimeRange !== ADAPTER_RUNTIME_RANGE) {
      issue(issues, 'compatibility.runtimeRange', `Runtime range must be ${ADAPTER_RUNTIME_RANGE}`);
    }
    for (const key of Object.keys(compatibility)) {
      if (!['sdkVersion', 'contractVersion', 'runtimeRange'].includes(key)) {
        issue(issues, `compatibility.${key}`, `Unsupported compatibility property: ${key}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function assertCommunityAdapter(adapter: unknown): asserts adapter is CommunityAdapter {
  const result = validateCommunityAdapter(adapter);
  if (!result.ok) {
    throw new AdapterSdkError('INVALID_ADAPTER', 'Community adapter metadata is invalid', result.issues);
  }
}

export function defineCommunityAdapter<T extends CommunityAdapter>(adapter: T): T {
  assertCommunityAdapter(adapter);
  return adapter;
}
