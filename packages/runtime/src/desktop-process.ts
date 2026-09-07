import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';

export interface DirectProcessCommand {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface DirectProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}

export async function isExecutable(path: string): Promise<boolean> {
  try { await access(path, constants.X_OK); return true; }
  catch { return false; }
}
export async function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(directory, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return undefined;
}

export async function runDirectProcess(
  command: DirectProcessCommand,
  signal?: AbortSignal,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectProcessResult> {
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let spawnError: string | undefined;
  child.stdout.on('data', chunk => { stdout += Buffer.from(chunk).toString('utf8'); });
  child.stderr.on('data', chunk => { stderr += Buffer.from(chunk).toString('utf8'); });
  child.on('error', error => { spawnError = error.name; });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, command.timeoutMs ?? 30000);
  const abort = () => child.kill();
  signal?.addEventListener('abort', abort, { once: true });

  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('close', (code, childSignal) => resolve({ code, signal: childSignal }));
  });

  clearTimeout(timeout);
  signal?.removeEventListener('abort', abort);
  return {
    ...outcome,
    stdout,
    stderr,
    timedOut,
    ...(spawnError ? { spawnError } : {})
  };
}
