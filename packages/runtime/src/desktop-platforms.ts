import { DesktopBackendRegistry } from './desktop-backend.js';
import { createLinuxX11DesktopBackend } from './linux-desktop.js';
import { createMacosDesktopBackend } from './macos-desktop.js';
import { createWindowsDesktopBackend } from './windows-desktop.js';

export function createDefaultDesktopBackendRegistry(): DesktopBackendRegistry {
  return new DesktopBackendRegistry([
    createMacosDesktopBackend(),
    createWindowsDesktopBackend(),
    createLinuxX11DesktopBackend()
  ]);
}
