import { RuntimeError } from './errors.js';

export interface RuntimeLimits {
  maxConcurrentAssignments: number;
  childProcessTimeoutMs: number;
  networkTimeoutMs: number;
  maxResponseBytes: number;
  maxBrowserSessions: number;
  desktopBatchTimeoutMs: number;
  maxSupervisionWorkPerCycle: number;
  maxRetryAttempts: number;
  sqliteBusyTimeoutMs: number;
}

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxConcurrentAssignments: 4,
  childProcessTimeoutMs: 30_000,
  networkTimeoutMs: 30_000,
  maxResponseBytes: 4 * 1024 * 1024,
  maxBrowserSessions: 4,
  desktopBatchTimeoutMs: 30_000,
  maxSupervisionWorkPerCycle: 50,
  maxRetryAttempts: 3,
  sqliteBusyTimeoutMs: 5_000,
};
export const HARD_RUNTIME_LIMITS: RuntimeLimits = {
  maxConcurrentAssignments: 32,
  childProcessTimeoutMs: 300_000,
  networkTimeoutMs: 300_000,
  maxResponseBytes: 67_108_864,
  maxBrowserSessions: 16,
  desktopBatchTimeoutMs: 300_000,
  maxSupervisionWorkPerCycle: 1_000,
  maxRetryAttempts: 10,
  sqliteBusyTimeoutMs: 60_000,
};

export interface RuntimeLimitValidation {
  limits: RuntimeLimits;
  weakened: (keyof RuntimeLimits)[];
}

export function validateRuntimeLimits(overrides: Partial<RuntimeLimits> = {}): RuntimeLimitValidation {
  const limits = { ...DEFAULT_RUNTIME_LIMITS, ...overrides };
  const weakened: (keyof RuntimeLimits)[] = [];
  for (const key of Object.keys(DEFAULT_RUNTIME_LIMITS) as (keyof RuntimeLimits)[]) {
    const value = limits[key];
    if (!Number.isInteger(value) || value <= 0 || value > HARD_RUNTIME_LIMITS[key]) {
      throw new RuntimeError('RESOURCE_LIMIT', `Invalid runtime limit ${key}: ${value}`);
    }
    if (value > DEFAULT_RUNTIME_LIMITS[key]) weakened.push(key);
  }
  return { limits, weakened };
}
export function retryDecision(input: {
  dispatched: boolean;
  retrySafe: boolean;
  attempt: number;
  limits: RuntimeLimits;
}): 'retry' | 'uncertain' | 'stop' {
  if (input.dispatched && !input.retrySafe) return 'uncertain';
  return input.attempt < input.limits.maxRetryAttempts ? 'retry' : 'stop';
}

export function boundedTimeout(configured: number | undefined, ceiling: number): number {
  return Math.min(configured ?? ceiling, ceiling);
}

export function assertWithinResponseLimit(value: unknown, maxBytes: number, label = 'response'): void {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  } catch {
    throw new RuntimeError('RESOURCE_LIMIT', `${label} could not be measured safely`);
  }
  if (bytes > maxBytes) {
    throw new RuntimeError('RESOURCE_LIMIT', `${label} exceeds configured response limit`, { bytes, maxBytes });
  }
}
