import { access } from 'node:fs/promises';

const candidates = process.platform === 'darwin' ? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
] : process.platform === 'win32' ? [
  `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`
] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

export async function browserExecutable() {
  if (process.env.Q1X_TEST_BROWSER_EXECUTABLE) return process.env.Q1X_TEST_BROWSER_EXECUTABLE;
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('No Chromium-compatible test browser found; set Q1X_TEST_BROWSER_EXECUTABLE');
}

export async function launchCdpBrowser() {
  const { createServer } = await import('node:net');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const executable = await browserExecutable();
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No TCP port'));
      const selected = address.port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  const userDataDir = await mkdtemp(join(tmpdir(), 'q1x-cdp-browser-'));
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu'
  ], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  const cleanup = async () => rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) return {
        url,
        async alive() { try { return (await fetch(`${url}/json/version`)).ok; } catch { return false; } },
        async close() {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGTERM');
            await new Promise(resolve => child.once('exit', resolve));
          }
          await cleanup();
        }
      };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  await cleanup();
  throw new Error('CDP test browser did not become ready');
}

export async function startBrowserSite() {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'browser-site');
  const requests = [];
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const pathname = requestUrl.pathname;
    requests.push(pathname);
    if (pathname === '/redirect') { res.statusCode = 302; res.setHeader('location', requestUrl.searchParams.get('to') ?? '/'); res.end(); return; }
    const file = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    try {
      const body = await readFile(join(root, file));
      res.statusCode = 200; res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body);
    } catch { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Browser fixture server has no TCP address');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise(resolve => server.close(resolve)) };
}