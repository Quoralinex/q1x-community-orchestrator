import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function resolveRuntimeHome(input?: string): string {
  const selected = input ?? process.env.Q1X_HOME ?? resolve(homedir(), '.q1x-community-orchestrator');
  return resolve(selected);
}
