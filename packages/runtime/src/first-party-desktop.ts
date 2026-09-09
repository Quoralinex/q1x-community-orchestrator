import type { DesktopActionKind, DesktopEndpoint, DesktopPlatform } from '@quoralinex/q1x-community-sdk';
import { supportedMacosActions } from '@quoralinex/q1x-community-desktop-bridge-macos/macos';
import { supportedWindowsActions } from '@quoralinex/q1x-community-desktop-bridge-windows/windows';
import { supportedLinuxActions } from '@quoralinex/q1x-community-desktop-bridge-linux/linux';
import { RuntimeError } from './errors.js';

export interface FirstPartyDesktopBridge {
  platform: Exclude<DesktopPlatform, 'any'>;
  command: string;
  supportedActions: readonly DesktopActionKind[];
}

export interface FirstPartyDesktopEndpointOptions {
  platform?: NodeJS.Platform | Exclude<DesktopPlatform, 'any'>;
  id?: string;
  name?: string;
  outputDir?: string;
}

function normalizedHostPlatform(platform: NodeJS.Platform | Exclude<DesktopPlatform, 'any'>): 'darwin' | 'win32' | 'linux' {
  if (platform === 'darwin' || platform === 'macos') return 'darwin';
  if (platform === 'win32' || platform === 'windows') return 'win32';
  if (platform === 'linux') return 'linux';
  throw new RuntimeError('UNSUPPORTED_PLATFORM', `First-party desktop control is unsupported on ${platform}`);
}

export function getFirstPartyDesktopBridge(platform: NodeJS.Platform | Exclude<DesktopPlatform, 'any'> = process.platform): FirstPartyDesktopBridge {
  switch (normalizedHostPlatform(platform)) {
    case 'darwin':
      return {
        platform: 'macos',
        command: 'q1x-desktop-bridge-macos',
        supportedActions: supportedMacosActions,
      };
    case 'win32':
      return {
        platform: 'windows',
        command: 'q1x-desktop-bridge-windows',
        supportedActions: supportedWindowsActions,
      };
    case 'linux':
      return {
        platform: 'linux',
        command: 'q1x-desktop-bridge-linux',
        supportedActions: supportedLinuxActions,
      };
  }
}

export function createFirstPartyDesktopEndpoint(options: FirstPartyDesktopEndpointOptions = {}): DesktopEndpoint {
  const bridge = getFirstPartyDesktopBridge(options.platform ?? process.platform);
  return {
    contractVersion: '1.0.0',
    id: options.id ?? `desktop.first-party.${bridge.platform}`,
    name: options.name ?? `Q1X first-party ${bridge.platform} desktop`,
    backend: 'stdio-bridge',
    platform: bridge.platform,
    executionLocation: 'local',
    supportedActions: [...bridge.supportedActions],
    transport: {
      command: bridge.command,
      args: [],
      timeoutMs: 30_000,
      maxOutputBytes: 4 * 1024 * 1024,
    },
    outputDir: options.outputDir ?? './desktop-output',
    metadata: {
      provenance: 'first-party',
      bridgeProtocol: 'q1x-desktop-bridge/1',
    },
  };
}
