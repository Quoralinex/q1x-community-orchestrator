import type { CapabilityDescriptor, ExecutionResult } from '@quoralinex/q1x-community-sdk';

import type {
  AdapterConformanceCheck,
  AdapterConformanceOptions,
  AdapterConformanceReport,
  CommunityAdapter,
  CommunityAdapterContext,
} from './types.js';
import { validateCommunityAdapter } from './validation.js';

const CONTRACT_VERSION = '1.0.0';
const RESULT_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'partial']);

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateExecutionResult(value: unknown, options: AdapterConformanceOptions): string | undefined {
  const result = record(value);
  if (!result) return 'Execution result must be an object';
  if (result.contractVersion !== CONTRACT_VERSION) return `Execution result contractVersion must be ${CONTRACT_VERSION}`;
  if (!nonEmptyString(result.id)) return 'Execution result id must be a non-empty string';
  if (result.requestId !== options.request.id) return 'Execution result requestId must match the conformance request';
  if (result.workItemId !== options.request.workItemId) return 'Execution result workItemId must match the conformance request';
  if (typeof result.status !== 'string' || !RESULT_STATUSES.has(result.status)) return 'Execution result status is invalid';
  if (!nonEmptyString(result.startedAt) || !nonEmptyString(result.finishedAt)) return 'Execution result timestamps must be non-empty strings';
  if (result.status === 'failed') {
    const failure = record(result.error);
    if (!failure || !nonEmptyString(failure.code) || !nonEmptyString(failure.message) || typeof failure.retryable !== 'boolean') {
      return 'Failed execution results must include a structured error';
    }
  }
  return undefined;
}

function validateCapability(value: unknown, index: number): string | undefined {
  const capability = record(value);
  const prefix = `Capability ${index}`;
  if (!capability) return `${prefix} must be an object`;
  if (capability.contractVersion !== CONTRACT_VERSION) return `${prefix} contractVersion must be ${CONTRACT_VERSION}`;
  if (!nonEmptyString(capability.id) || !nonEmptyString(capability.name)) return `${prefix} id and name must be non-empty strings`;
  if (!nonEmptyString(capability.adapterKind)) return `${prefix} adapterKind must be a non-empty string`;
  if (!stringArray(capability.operations) || capability.operations.length === 0) return `${prefix} operations must contain at least one operation`;

  const modalities = record(capability.modalities);
  if (!modalities || !stringArray(modalities.input) || !stringArray(modalities.output)) return `${prefix} modalities must contain input and output arrays`;

  const availability = record(capability.availability);
  if (!availability || !nonEmptyString(availability.state) || !nonEmptyString(availability.checkedAt)) return `${prefix} availability is invalid`;

  const cost = record(capability.cost);
  if (!cost || !nonEmptyString(cost.class)) return `${prefix} cost is invalid`;

  const privacy = record(capability.privacy);
  if (!privacy || !nonEmptyString(privacy.executionLocation)) return `${prefix} privacy is invalid`;

  const trust = record(capability.trust);
  if (!trust || !nonEmptyString(trust.level)) return `${prefix} trust is invalid`;

  if (!stringArray(capability.platforms)) return `${prefix} platforms must be an array of strings`;
  return undefined;
}

function validateDiscoveryResult(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'Discovery result must be an array';
  for (let index = 0; index < value.length; index += 1) {
    const issue = validateCapability(value[index], index);
    if (issue) return issue;
  }
  return undefined;
}

export async function runAdapterConformance(
  candidate: unknown,
  options: AdapterConformanceOptions,
): Promise<AdapterConformanceReport> {
  const checks: AdapterConformanceCheck[] = [];
  const validation = validateCommunityAdapter(candidate);
  const protocol = record(candidate)?.protocol;

  checks.push({
    name: 'adapter-metadata',
    ok: validation.ok,
    ...(validation.ok ? {} : { message: validation.issues.map(issue => `${issue.field}: ${issue.message}`).join('; ') }),
  });

  if (!validation.ok) {
    return {
      ok: false,
      protocol: typeof protocol === 'string' ? protocol : '<invalid>',
      checks,
    };
  }

  const adapter = candidate as CommunityAdapter;
  const endpointSnapshot = stableSnapshot(options.endpoint);
  const requestSnapshot = stableSnapshot(options.request);
  const context: CommunityAdapterContext = {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };

  try {
    const executionResult: ExecutionResult = await adapter.execute(options.endpoint, options.request, context);
    const issue = validateExecutionResult(executionResult, options);
    checks.push({ name: 'execute-result', ok: !issue, ...(issue ? { message: issue } : {}) });
  } catch (error) {
    checks.push({ name: 'execute-result', ok: false, message: `Adapter execute threw: ${errorMessage(error)}` });
  }

  if (typeof adapter.discover === 'function') {
    try {
      const capabilities: readonly CapabilityDescriptor[] = await adapter.discover(options.endpoint, context);
      const issue = validateDiscoveryResult(capabilities);
      checks.push({ name: 'discover-result', ok: !issue, ...(issue ? { message: issue } : {}) });
    } catch (error) {
      checks.push({ name: 'discover-result', ok: false, message: `Adapter discover threw: ${errorMessage(error)}` });
    }
  } else {
    checks.push({ name: 'discover-result', ok: true, message: 'Adapter does not implement optional discovery' });
  }

  const fixturesUnchanged = endpointSnapshot === stableSnapshot(options.endpoint)
    && requestSnapshot === stableSnapshot(options.request);
  checks.push({
    name: 'fixture-immutability',
    ok: fixturesUnchanged,
    ...(fixturesUnchanged ? {} : { message: 'Adapter mutated the supplied endpoint or execution request fixture' }),
  });

  return {
    ok: checks.every(check => check.ok),
    protocol: adapter.protocol,
    checks,
  };
}
