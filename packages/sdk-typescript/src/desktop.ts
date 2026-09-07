import type { ContractVersion, Identifier, Platform } from './common.js';

export type DesktopPlatform = Extract<Platform, 'macos' | 'windows' | 'linux'> | 'any';
export type DesktopExecutionLocation = 'local' | 'private-network' | 'managed-cloud' | 'public-cloud';

export interface DesktopEnvironmentMapping {
  name: string;
  environmentKey: string;
}

export interface DesktopStdioTransport {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  environment?: DesktopEnvironmentMapping[];
}

export interface DesktopEndpoint {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  backend: string;
  platform: DesktopPlatform;
  executionLocation: DesktopExecutionLocation;
  transport?: DesktopStdioTransport;
  backendConfig?: Record<string, unknown>;
  applicationPolicy?: {
    allowedApplications?: string[];
    blockedApplications?: string[];
  };
  outputDir?: string;
  fileAccessRoots?: string[];
  metadata?: Record<string, unknown>;
}

export type DesktopTarget =
  | { by: 'accessibility-id'; value: string }
  | { by: 'role'; role: string; name?: string; exact?: boolean }
  | { by: 'name'; value: string; exact?: boolean }
  | { by: 'text'; value: string; exact?: boolean }
  | { by: 'path'; value: string[] };

export type DesktopActionKind =
  | 'list-applications' | 'launch-application' | 'focus-application' | 'close-application'
  | 'list-windows' | 'focus-window' | 'move-window' | 'resize-window'
  | 'inspect' | 'find' | 'click' | 'double-click' | 'hover' | 'type' | 'press'
  | 'set-value' | 'select' | 'toggle' | 'mouse-move' | 'mouse-down' | 'mouse-up'
  | 'wheel' | 'drag' | 'wait' | 'screenshot';

export interface DesktopAction {
  id: Identifier;
  kind: DesktopActionKind;
  application?: string;
  arguments?: string[];
  windowId?: string;
  target?: DesktopTarget;
  source?: DesktopTarget;
  text?: string;
  key?: string;
  value?: string | number | boolean | null;
  values?: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  deltaX?: number;
  deltaY?: number;
  button?: 'left' | 'middle' | 'right';
  outputPath?: string;
  milliseconds?: number;
  timeoutMs?: number;
}

export interface DesktopActionBatch {
  contractVersion: ContractVersion;
  id: Identifier;
  actions: DesktopAction[];
  stopOnError?: boolean;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface DesktopActionResult {
  id: Identifier;
  status: 'succeeded' | 'failed' | 'cancelled';
  durationMs: number;
  output?: unknown;
  error?: { code: string; message: string };
}

export interface DesktopBatchResult {
  contractVersion: ContractVersion;
  id: Identifier;
  batchId: Identifier;
  status: 'succeeded' | 'failed' | 'cancelled' | 'partial';
  actions: DesktopActionResult[];
  startedAt?: string;
  finishedAt?: string;
  metadata?: Record<string, unknown>;
}
