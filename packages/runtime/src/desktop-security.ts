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
