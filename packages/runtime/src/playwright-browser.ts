import type { Browser, BrowserContext, BrowserType, Page } from 'playwright-core';
import { chromium, firefox, webkit } from 'playwright-core';
import type { BrowserEndpoint } from '@quoralinex/q1x-community-sdk';
import { BrowserBackendRegistry, type BrowserBackend, type BrowserBackendSession } from './browser-backend.js';
import { RuntimeError } from './errors.js';

export class PlaywrightBrowserSession implements BrowserBackendSession {
  constructor(
    readonly endpoint: BrowserEndpoint,
    readonly browser: Browser | null,
    readonly context: BrowserContext,
    readonly page: Page,
    readonly persistent: boolean,
    private readonly connected: boolean
  ) {}
  async close(): Promise<void> {
    if (this.connected) {
      if (this.browser) await this.browser.close();
      return;
    }
    if (this.persistent) {
      await this.context.close();
      return;
    }
    if (!this.connected) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}

function browserType(engine: BrowserEndpoint['engine']): BrowserType {
  if (engine === 'firefox') return firefox;
  if (engine === 'webkit') return webkit;
  return chromium;
}

class PlaywrightBrowserBackend implements BrowserBackend {
  readonly id = 'playwright';
  async open(endpoint: BrowserEndpoint): Promise<PlaywrightBrowserSession> {
    const timeout = endpoint.timeoutMs ?? 30_000;
    if (endpoint.mode === 'cdp') {
      const browser = await chromium.connectOverCDP(endpoint.cdpUrl ?? '', { timeout });
      const context = browser.contexts()[0];
      if (!context) {
        await browser.close();
        throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Connected browser exposed no default context');
      }
      const page = context.pages()[0] ?? await context.newPage();
      return new PlaywrightBrowserSession(endpoint, browser, context, page, true, true);
    }
    const type = browserType(endpoint.engine);
    const launch = {
      headless: endpoint.headless ?? true,
      ...(endpoint.browserChannel ? { channel: endpoint.browserChannel } : {}),
      ...(endpoint.executablePath ? { executablePath: endpoint.executablePath } : {}),
      ...(endpoint.launchArgs ? { args: endpoint.launchArgs } : {}),
      timeout
    };
    if (endpoint.userDataDir) {
      const context = await type.launchPersistentContext(endpoint.userDataDir, {
        ...launch,
        ...(endpoint.viewport ? { viewport: endpoint.viewport } : {}),
        acceptDownloads: true
      });
      const page = context.pages()[0] ?? await context.newPage();
      return new PlaywrightBrowserSession(endpoint, context.browser(), context, page, true, false);
    }
    const browser = await type.launch(launch);
    const context = await browser.newContext({
      ...(endpoint.viewport ? { viewport: endpoint.viewport } : {}),
      acceptDownloads: true
    });
    const page = await context.newPage();
    return new PlaywrightBrowserSession(endpoint, browser, context, page, false, false);
  }
}

export function createDefaultBrowserBackendRegistry(): BrowserBackendRegistry {
  return new BrowserBackendRegistry([new PlaywrightBrowserBackend()]);
}
