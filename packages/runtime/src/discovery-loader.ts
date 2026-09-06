import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SCHEMA_IDS } from '@quoralinex/q1x-community-contracts';
import type { DiscoveryManifest } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { validateContract } from './schema-loader.js';

function parseManifest(file: string): DiscoveryManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    throw new RuntimeError('SCHEMA_INVALID', `Discovery manifest is not valid JSON: ${file}`, {
      reason: error instanceof Error ? error.name : 'parse error'
    });
  }
  return validateContract(SCHEMA_IDS.discoveryManifest, value) as DiscoveryManifest;
}

export function loadDiscoveryManifests(input: string): DiscoveryManifest[] {
  const target = resolve(input);
  let stats;
  try { stats = statSync(target); }
  catch { throw new RuntimeError('NOT_FOUND', `Discovery manifest path not found: ${target}`); }
  if (stats.isFile()) return [parseManifest(target)];
  if (!stats.isDirectory()) throw new RuntimeError('NOT_FOUND', `Discovery manifest path is not a file or directory: ${target}`);
  return readdirSync(target, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.discovery.json'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map(name => parseManifest(join(target, name)));
}
