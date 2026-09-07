import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Locator, Page } from 'playwright-core';
import type {
  BrowserAction, BrowserActionBatch, BrowserActionResult, BrowserBatchResult, BrowserTarget
} from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { assertSafeBrowserNavigation } from './browser-security.js';
import type { PlaywrightBrowserSession } from './playwright-browser.js';

function locator(page: Page, target: BrowserTarget): Locator {
  if (target.by === 'selector') return page.locator(target.value);
  if (target.by === 'text') return page.getByText(target.value, { exact: target.exact });
  if (target.by === 'label') return page.getByLabel(target.value, { exact: target.exact });
  if (target.by === 'placeholder') return page.getByPlaceholder(target.value, { exact: target.exact });
  return page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.name, exact: target.exact });
}

function requiredTarget(page: Page, action: BrowserAction): Locator {
  if (!action.target) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Browser action ${action.kind} requires a target`);
  return locator(page, action.target);
}

async function inspect(page: Page, action: BrowserAction): Promise<unknown> {
  const scope = action.target ? locator(page, action.target) : page.locator('body');
  const text = await scope.innerText();
  const interactive = await scope.locator('a,button,input,textarea,select,[role]').evaluateAll(elements => elements.map(element => {
    const html = element as HTMLElement;
    const input = element as HTMLInputElement;
    return {
      tag: element.tagName.toLowerCase(),
      id: html.id || undefined,
      role: element.getAttribute('role') || undefined,
      type: input.type || undefined,
      text: (html.innerText || '').slice(0, 512) || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      placeholder: element.getAttribute('placeholder') || undefined
    };
  }));
  return { url: page.url(), title: await page.title(), text, interactive };
}

async function extract(page: Page, action: BrowserAction): Promise<unknown> {
  const scope = action.target ? locator(page, action.target) : page.locator('body');
  const mode = action.extract ?? 'text';
  if (mode === 'html') return scope.innerHTML();
  if (mode === 'attribute') {
    if (!action.attribute) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Browser attribute extraction requires an attribute name');
    if (action.attribute === 'value') {
      try { return await scope.inputValue(); } catch {}
    }
    return scope.getAttribute(action.attribute);
  }
  return scope.innerText();
}


function inside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function outputPath(session: PlaywrightBrowserSession, requested: string | undefined): string {
  if (!requested || !session.endpoint.downloadDir) throw new RuntimeError('INSECURE_ENDPOINT', 'Browser output requires a configured downloadDir and outputPath');
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(session.endpoint.downloadDir, requested);
  if (!inside(session.endpoint.downloadDir, candidate)) throw new RuntimeError('INSECURE_ENDPOINT', 'Browser output path escapes the configured downloadDir');
  return candidate;
}

function uploadPaths(session: PlaywrightBrowserSession, requested: string[] | undefined): string[] {
  if (!requested?.length || !session.endpoint.fileAccessRoots?.length) throw new RuntimeError('INSECURE_ENDPOINT', 'Browser upload requires configured fileAccessRoots');
  const resolved = requested.map(value => resolve(value));
  for (const candidate of resolved) {
    if (!session.endpoint.fileAccessRoots.some(root => inside(root, candidate))) throw new RuntimeError('INSECURE_ENDPOINT', 'Browser upload path is outside configured fileAccessRoots');
  }
  return resolved;
}

async function preflightNavigation(session: PlaywrightBrowserSession, rawUrl: string, timeout?: number): Promise<URL> {
  let current = assertSafeBrowserNavigation(session.endpoint, rawUrl);
  const policy = session.endpoint.navigation;
  if (!policy?.allowedOrigins?.length && !policy?.blockedOrigins?.length) return current;
  for (let redirects = 0; redirects <= 10; redirects += 1) {
    const response = await session.context.request.get(current.href, { maxRedirects: 0, timeout, failOnStatusCode: false });
    try {
      const status = response.status();
      const location = response.headers()['location'];
      if (status < 300 || status >= 400 || !location) return current;
      const next = new URL(location, current);
      assertSafeBrowserNavigation(session.endpoint, next.href);
      current = next;
    } finally {
      await response.dispose();
    }
  }
  throw new RuntimeError('INSECURE_ENDPOINT', 'Browser navigation redirect limit exceeded during policy preflight');
}

async function executeAction(session: PlaywrightBrowserSession, action: BrowserAction): Promise<unknown> {
  const page = session.page;
  const timeout = action.timeoutMs;
  if (action.kind === 'navigate') { const url = await preflightNavigation(session, action.url ?? '', timeout); await page.goto(url.href, { timeout }); assertSafeBrowserNavigation(session.endpoint, page.url()); return { url: page.url(), title: await page.title() }; }
  if (action.kind === 'back') { await page.goBack({ timeout }); return { url: page.url(), title: await page.title() }; }
  if (action.kind === 'forward') { await page.goForward({ timeout }); return { url: page.url(), title: await page.title() }; }
  if (action.kind === 'reload') { await page.reload({ timeout }); return { url: page.url(), title: await page.title() }; }
  if (action.kind === 'inspect') return inspect(page, action);
  if (action.kind === 'extract') return extract(page, action);
  if (action.kind === 'click') { await requiredTarget(page, action).click({ timeout }); return undefined; }
  if (action.kind === 'double-click') { await requiredTarget(page, action).dblclick({ timeout }); return undefined; }
  if (action.kind === 'hover') { await requiredTarget(page, action).hover({ timeout }); return undefined; }
  if (action.kind === 'fill') { await requiredTarget(page, action).fill(action.text ?? '', { timeout }); return undefined; }
  if (action.kind === 'type') { await requiredTarget(page, action).pressSequentially(action.text ?? '', { timeout }); return undefined; }
  if (action.kind === 'press') { await requiredTarget(page, action).press(action.key ?? '', { timeout }); return undefined; }
  if (action.kind === 'select') { await requiredTarget(page, action).selectOption(action.values ?? [], { timeout }); return undefined; }
  if (action.kind === 'check') { await requiredTarget(page, action).check({ timeout }); return undefined; }
  if (action.kind === 'uncheck') { await requiredTarget(page, action).uncheck({ timeout }); return undefined; }
  if (action.kind === 'mouse-move') { await page.mouse.move(action.x ?? 0, action.y ?? 0); return undefined; }
  if (action.kind === 'mouse-down') { await page.mouse.down({ button: action.button ?? 'left' }); return undefined; }
  if (action.kind === 'mouse-up') { await page.mouse.up({ button: action.button ?? 'left' }); return undefined; }
  if (action.kind === 'wheel') { await page.mouse.wheel(action.deltaX ?? 0, action.deltaY ?? 0); return undefined; }
  if (action.kind === 'drag') {
    if (!action.source || !action.target) throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', 'Browser drag requires source and target');
    await locator(page, action.source).dragTo(locator(page, action.target), { timeout }); return undefined;
  }
  if (action.kind === 'upload') {
    await requiredTarget(page, action).setInputFiles(uploadPaths(session, action.paths), { timeout }); return undefined;
  }
  if (action.kind === 'download') {
    const destination = outputPath(session, action.outputPath);
    const pending = page.waitForEvent('download', { timeout });
    await requiredTarget(page, action).click({ timeout });
    const download = await pending;
    await mkdir(dirname(destination), { recursive: true });
    await download.saveAs(destination);
    return { path: destination, suggestedFilename: download.suggestedFilename() };
  }
  if (action.kind === 'screenshot') {
    const destination = outputPath(session, action.outputPath);
    await mkdir(dirname(destination), { recursive: true });
    if (action.target) await requiredTarget(page, action).screenshot({ path: destination });
    else await page.screenshot({ path: destination, fullPage: action.fullPage ?? false });
    return { path: destination };
  }
  if (action.kind === 'wait') {
    if (action.target) await requiredTarget(page, action).waitFor({ state: 'visible', timeout });
    else await page.waitForTimeout(action.milliseconds ?? 0);
    return undefined;
  }
  throw new RuntimeError('ADAPTER_TRANSPORT_ERROR', `Browser action is not implemented yet: ${action.kind}`);
}

function failedResult(action: BrowserAction, started: number, error: unknown): BrowserActionResult {
  return {
    id: action.id,
    status: 'failed',
    durationMs: Math.max(0, Date.now() - started),
    error: { code: error instanceof RuntimeError ? error.code : 'BROWSER_ACTION_ERROR', message: `Browser action ${action.kind} failed (${error instanceof Error ? error.name : 'Error'})` }
  };
}

export async function executePlaywrightBatch(session: PlaywrightBrowserSession, batch: BrowserActionBatch, signal?: AbortSignal): Promise<BrowserBatchResult> {
  const startedAt = new Date().toISOString();
  const actions: BrowserActionResult[] = [];
  let overall: BrowserBatchResult['status'] = 'succeeded';
  for (const action of batch.actions) {
    if (signal?.aborted) { overall = 'cancelled'; break; }
    const started = Date.now();
    try {
      const output = await executeAction(session, action);
      actions.push({ id: action.id, status: 'succeeded', durationMs: Math.max(0, Date.now() - started), ...(output !== undefined ? { output } : {}) });
    } catch (error) {
      actions.push(failedResult(action, started, error));
      overall = batch.stopOnError === false ? 'partial' : 'failed';
      if (batch.stopOnError !== false) break;
    }
  }
  return {
    contractVersion: '1.0.0', id: `${batch.id}.result`, batchId: batch.id, status: overall,
    finalUrl: session.page.url(), finalTitle: await session.page.title(), actions,
    startedAt, finishedAt: new Date().toISOString()
  };
}
