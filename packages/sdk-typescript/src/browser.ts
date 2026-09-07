import type { ContractVersion, Identifier } from './common.js';

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
export type BrowserMode = 'managed' | 'cdp';

export interface BrowserEndpoint {
  contractVersion: ContractVersion;
  id: Identifier;
  name: string;
  backend: string;
  mode: BrowserMode;
  engine?: BrowserEngine;
  headless?: boolean;
  browserChannel?: string;
  executablePath?: string;
  userDataDir?: string;
  launchArgs?: string[];
  cdpUrl?: string;
  viewport?: { width: number; height: number };
  downloadDir?: string;
  fileAccessRoots?: string[];
  navigation?: { allowedOrigins?: string[]; blockedOrigins?: string[] };
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export type BrowserTarget =
  | { by: 'selector'; value: string }
  | { by: 'text'; value: string; exact?: boolean }
  | { by: 'role'; role: string; name?: string; exact?: boolean }
  | { by: 'label'; value: string; exact?: boolean }
  | { by: 'placeholder'; value: string; exact?: boolean };

export type BrowserActionKind =
  | 'navigate' | 'back' | 'forward' | 'reload' | 'inspect' | 'extract'
  | 'click' | 'double-click' | 'hover' | 'fill' | 'type' | 'press' | 'select'
  | 'check' | 'uncheck' | 'mouse-move' | 'mouse-down' | 'mouse-up' | 'wheel'
  | 'drag' | 'wait' | 'upload' | 'download' | 'screenshot';

export interface BrowserAction {
  id: Identifier;
  kind: BrowserActionKind;
  target?: BrowserTarget;
  source?: BrowserTarget;
  url?: string;
  text?: string;
  key?: string;
  value?: string;
  values?: string[];
  x?: number; y?: number; deltaX?: number; deltaY?: number;
  button?: 'left' | 'middle' | 'right';
  paths?: string[];
  outputPath?: string;
  extract?: 'text' | 'html' | 'attribute';
  attribute?: string;
  fullPage?: boolean;
  milliseconds?: number;
  timeoutMs?: number;
}

export interface BrowserActionBatch {
  contractVersion: ContractVersion;
  id: Identifier;
  actions: BrowserAction[];
  stopOnError?: boolean;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface BrowserActionResult {
  id: Identifier;
  status: 'succeeded' | 'failed' | 'cancelled';
  durationMs: number;
  output?: unknown;
  error?: { code: string; message: string };
}

export interface BrowserBatchResult {
  contractVersion: ContractVersion;
  id: Identifier;
  batchId: Identifier;
  status: 'succeeded' | 'failed' | 'cancelled' | 'partial';
  finalUrl?: string;
  finalTitle?: string;
  actions: BrowserActionResult[];
  startedAt?: string;
  finishedAt?: string;
}
