import { isAbsolute } from 'node:path';
import type { DesktopApplicationSelector, DesktopEndpoint } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

function isWindowsAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

function assertNoNul(value: string, label: string): void {
  if (value.includes('\0')) {
    throw new RuntimeError('INSECURE_ENDPOINT', `${label} contains an invalid NUL byte`);
  }
}

function assertSelectorPath(selector: DesktopApplicationSelector): void {
  if (selector.platform === 'windows' && selector.kind === 'executable-path') {
    if (!isWindowsAbsolute(selector.value)) {
      throw new RuntimeError('INSECURE_ENDPOINT', 'Windows executable-path selectors must be absolute');
    }
  }
}

export function assertSafeDesktopEndpoint(endpoint: DesktopEndpoint): void {
  if (endpoint.screenshotDir && !isAbsolute(endpoint.screenshotDir)) {
    throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop screenshotDir must be an absolute path');
  }
  const ids = new Set<string>();
  const platforms = new Set(endpoint.platforms);
  for (const application of endpoint.allowedApplications) {
    if (ids.has(application.id)) {
      throw new RuntimeError('INSECURE_ENDPOINT', `Duplicate desktop application id: ${application.id}`);
    }
    ids.add(application.id);
    for (const selector of application.selectors) {
      assertNoNul(selector.value, 'Desktop application selector');
      if (!platforms.has(selector.platform)) {
        throw new RuntimeError(
          'INSECURE_ENDPOINT',
          `Desktop selector platform is not enabled by endpoint: ${selector.platform}`
        );
      }
      assertSelectorPath(selector);
    }
  }
}

export function resolveDesktopApplication(
  endpoint: DesktopEndpoint,
  applicationId: string
) {
  const application = endpoint.allowedApplications.find(candidate => candidate.id === applicationId);
  if (!application) {
    throw new RuntimeError('INVALID_REFERENCE', `Desktop application is not allowlisted: ${applicationId}`);
  }
  return application;
}

export function assertSafeDesktopBatch(endpoint: DesktopEndpoint, batch: import('@quoralinex/q1x-community-sdk').DesktopActionBatch): void {
  const allowed = new Set(endpoint.allowedApplications.map(application => application.id));
  const inputKinds = new Set(['click','double-click','mouse-move','mouse-down','mouse-up','wheel','drag','type','press','hotkey']);
  for (const action of batch.actions) {
    const references = [action.applicationId, action.target?.by === 'application' ? action.target.applicationId : undefined,
      action.target?.by === 'window' ? action.target.applicationId : undefined,
      action.target?.by === 'accessibility' ? action.target.applicationId : undefined,
      action.source?.by === 'application' ? action.source.applicationId : undefined,
      action.source?.by === 'window' ? action.source.applicationId : undefined,
      action.source?.by === 'accessibility' ? action.source.applicationId : undefined].filter(Boolean) as string[];
    for (const id of references) {
      if (!allowed.has(id)) throw new RuntimeError('INVALID_REFERENCE', `Desktop application is not allowlisted: ${id}`);
    }
    if (action.target?.by === 'window' && !action.target.applicationId && !action.target.title) {
      throw new RuntimeError('SCHEMA_INVALID', 'Desktop window target requires applicationId or title');
    }
    if (action.target?.by === 'accessibility' && !action.target.role && !action.target.name && !action.target.identifier) {
      throw new RuntimeError('SCHEMA_INVALID', 'Desktop accessibility target requires role, name or identifier');
    }
    if (action.kind === 'launch' && endpoint.policy?.allowLaunch === false) {
      throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop endpoint policy blocks application launch');
    }
    if (action.kind === 'quit' && endpoint.policy?.allowQuit === false) {
      throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop endpoint policy blocks application quit');
    }
    if (inputKinds.has(action.kind) && endpoint.policy?.allowInput === false) {
      throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop endpoint policy blocks input actions');
    }
    if (action.kind === 'screenshot' && endpoint.policy?.allowCapture === false) {
      throw new RuntimeError('INSECURE_ENDPOINT', 'Desktop endpoint policy blocks capture actions');
    }
  }
}
