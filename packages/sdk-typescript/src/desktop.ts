import type { ContractVersion, Identifier } from './common.js';

export type DesktopPlatform = 'macos' | 'windows' | 'linux';

export type DesktopApplicationSelector =
  | { platform: 'macos'; kind: 'bundle-id' | 'application-name'; value: string }
  | { platform: 'windows'; kind: 'app-user-model-id' | 'process-name' | 'executable-path'; value: string }
  | { platform: 'linux'; kind: 'desktop-id' | 'process-name' | 'command'; value: string };

export interface DesktopApplication {
  id: Identifier;
  name: string;
  selectors: DesktopApplicationSelector[];
}

export interface DesktopEndpoint {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  backend: string;
  platforms: DesktopPlatform[];
  allowedApplications: DesktopApplication[];
  screenshotDir?: string;
  timeoutMs?: number;
  policy?: {
    allowLaunch?: boolean;
    allowQuit?: boolean;
    allowInput?: boolean;
    allowCapture?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export type DesktopTarget =
  | { by: 'application'; applicationId: Identifier }
  | { by: 'coordinates'; x: number; y: number }
  | { by: 'window'; applicationId?: Identifier; title?: string }
  | {
      by: 'accessibility';
      applicationId: Identifier;
      role?: string;
      name?: string;
      identifier?: string;
    };

export type DesktopActionKind =
  | 'launch' | 'activate' | 'quit' | 'inspect'
  | 'click' | 'double-click' | 'mouse-move' | 'mouse-down'
  | 'mouse-up' | 'wheel' | 'drag' | 'type' | 'press'
  | 'hotkey' | 'wait' | 'screenshot';

export interface DesktopAction {
  id: Identifier;
  kind: DesktopActionKind;
  applicationId?: Identifier;
  target?: DesktopTarget;
  source?: DesktopTarget;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  button?: 'left' | 'middle' | 'right';
  text?: string;
  key?: string;
  keys?: string[];
  milliseconds?: number;
  outputPath?: string;
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
}
