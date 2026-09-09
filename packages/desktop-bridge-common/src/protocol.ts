import type { DesktopActionBatch, DesktopBatchResult } from '@quoralinex/q1x-community-sdk';

export const BRIDGE_PROTOCOL = 'q1x-desktop-bridge/1' as const;
export const MAX_BRIDGE_BYTES = 4 * 1024 * 1024;

export type BridgePlatform = 'macos' | 'windows' | 'linux' | 'any';
export type BridgeDiagnosticState = 'ok' | 'warning' | 'blocked' | 'unsupported' | 'not-configured';

export interface DesktopBridgeEnvelope {
  protocol: typeof BRIDGE_PROTOCOL;
  endpoint: {
    id: string;
    platform: BridgePlatform;
  };
  batch: DesktopActionBatch;
}

export interface BridgeDoctorCheck {
  id: string;
  state: BridgeDiagnosticState;
  message: string;
  remediation?: string;
  evidence?: Record<string, unknown>;
}

export interface BridgeDoctorResult {
  protocol: typeof BRIDGE_PROTOCOL;
  platform: Exclude<BridgePlatform, 'any'>;
  state: BridgeDiagnosticState;
  checks: BridgeDoctorCheck[];
}

export interface BridgeFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface BridgeSuccess {
  ok: true;
  result: DesktopBatchResult;
}

export type BridgeOutput = BridgeSuccess | BridgeFailure;

export type BridgeValidationResult =
  | { ok: true; value: DesktopBridgeEnvelope }
  | { ok: false; code: 'INVALID_BRIDGE_ENVELOPE'; message: string };

type JsonRecord = Record<string, unknown>;

const DESKTOP_ACTION_KINDS = new Set([
  'list-applications', 'launch-application', 'focus-application', 'close-application',
  'list-windows', 'focus-window', 'move-window', 'resize-window',
  'inspect', 'find', 'click', 'double-click', 'hover', 'type', 'press',
  'set-value', 'select', 'toggle', 'mouse-move', 'mouse-down', 'mouse-up',
  'wheel', 'drag', 'wait', 'screenshot',
]);

const DESKTOP_PLATFORMS = new Set<BridgePlatform>(['macos', 'windows', 'linux', 'any']);

function object(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function invalid(message: string): BridgeValidationResult {
  return { ok: false, code: 'INVALID_BRIDGE_ENVELOPE', message };
}

export function validateBridgeEnvelope(value: unknown): BridgeValidationResult {
  const root = object(value);
  if (!root || root.protocol !== BRIDGE_PROTOCOL) {
    return invalid(`protocol must be ${BRIDGE_PROTOCOL}`);
  }

  const endpoint = object(root.endpoint);
  if (!endpoint || !identifier(endpoint.id) || typeof endpoint.platform !== 'string' || !DESKTOP_PLATFORMS.has(endpoint.platform as BridgePlatform)) {
    return invalid('endpoint must contain a valid id and desktop platform');
  }

  const batch = object(root.batch);
  if (!batch || batch.contractVersion !== '1.0.0' || !identifier(batch.id) || !Array.isArray(batch.actions)) {
    return invalid('batch must use contractVersion 1.0.0 and contain id/actions');
  }

  for (const actionValue of batch.actions) {
    const action = object(actionValue);
    if (!action || !identifier(action.id) || typeof action.kind !== 'string' || !DESKTOP_ACTION_KINDS.has(action.kind)) {
      return invalid('every desktop action must contain a valid id and supported kind');
    }
  }

  return { ok: true, value: value as DesktopBridgeEnvelope };
}

export function createBridgeSuccess(result: DesktopBatchResult): BridgeSuccess {
  return { ok: true, result };
}

export function createBridgeFailure(code: string, message: string, details?: Record<string, unknown>): BridgeFailure {
  const safeCode = code.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80) || 'BRIDGE_ERROR';
  const safeMessage = message.slice(0, 512);
  return {
    ok: false,
    error: {
      code: safeCode,
      message: safeMessage,
      ...(details ? { details } : {}),
    },
  };
}
