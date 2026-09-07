#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutionRequest, ExecutionResult, Mission, ModelEndpoint, ModelRequest, Programme, ReplanEvent, WorkGraph } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { OpenControlRuntime } from './runtime.js';
import { loadDiscoveryManifests } from './discovery-loader.js';

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  args.splice(index, 2);
  return value;
}

function requiredOption(args: string[], name: string): string {
  const value = takeOption(args, name);
  if (!value) throw new Error(`Required option ${name} is missing`);
  return value;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
}

function required<T>(value: T | undefined, kind: string, id: string): T {
  if (value === undefined) throw new RuntimeError('NOT_FOUND', `${kind} not found: ${id}`);
  return value;
}

async function execute(runtime: OpenControlRuntime, args: string[]): Promise<unknown> {
  const command = args.shift();
  if (!command) throw new Error('A command is required');
  if (command === 'init') return runtime.getStatus();
  if (command === 'status') return runtime.getStatus(takeOption(args, '--programme'));
  if (command === 'discover') {
    const manifests = loadDiscoveryManifests(requiredOption(args, '--manifest'));
    return runtime.discoverMany(manifests);
  }

  const action = args.shift();
  if (command === 'capabilities') {
    if (action === 'list') return runtime.listCapabilities();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('capabilities get requires an id');
      return required(runtime.getCapability(id), 'Capability', id);
    }
  }
  if (command === 'adapters') {
    if (action === 'list') return runtime.listAdapterManifests();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('adapters get requires an id');
      return required(runtime.getAdapterManifest(id), 'Adapter manifest', id);
    }
  }
  if (command === 'endpoints') {
    if (action === 'put') return runtime.putModelEndpoint(readJsonFile(requiredOption(args, '--file')) as ModelEndpoint);
    if (action === 'list') return runtime.listModelEndpoints();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('endpoints get requires an id');
      return required(runtime.getModelEndpoint(id), 'Model endpoint', id);
    }
  }
  if (command === 'model' && action === 'invoke') {
    return runtime.invokeModel(readJsonFile(requiredOption(args, '--file')) as ModelRequest);
  }
  if (command === 'mission') {
    if (action === 'put') return runtime.putMission(readJsonFile(requiredOption(args, '--file')) as Mission);
    if (action === 'list') return runtime.listMissions();
    if (action === 'show') {
      const id = args.shift(); if (!id) throw new Error('mission show requires an id');
      return required(runtime.getMission(id), 'Mission', id);
    }
  }
  if (command === 'programme') {
    if (action === 'put') return runtime.putProgramme(readJsonFile(requiredOption(args, '--file')) as Programme);
    if (action === 'list') return runtime.listProgrammes();
    if (action === 'show') {
      const id = args.shift(); if (!id) throw new Error('programme show requires an id');
      return required(runtime.getProgramme(id), 'Programme', id);
    }
  }
  if (command === 'graph') {
    if (action === 'put') return runtime.putWorkGraph(readJsonFile(requiredOption(args, '--file')) as WorkGraph);
    if (action === 'show') {
      const id = args.shift(); if (!id) throw new Error('graph show requires an id');
      return required(runtime.getWorkGraph(id), 'Work graph', id);
    }
  }
  if (command === 'replan' && action === 'record') {
    return runtime.recordReplanEvent(readJsonFile(requiredOption(args, '--file')) as ReplanEvent);
  }
  if (command === 'execution') {
    if (action === 'request') {
      return runtime.recordExecutionRequest(readJsonFile(requiredOption(args, '--file')) as ExecutionRequest);
    }
    if (action === 'result') {
      return runtime.recordExecutionResult(readJsonFile(requiredOption(args, '--file')) as ExecutionResult);
    }
  }
  if (command === 'checkpoint') {
    if (action === 'create') {
      const programmeId = args.shift(); if (!programmeId) throw new Error('checkpoint create requires a programme id');
      return runtime.createCheckpoint(programmeId, takeOption(args, '--id'));
    }
    if (action === 'list') return runtime.listCheckpoints(takeOption(args, '--programme'));
    if (action === 'restore') {
      const id = args.shift(); if (!id) throw new Error('checkpoint restore requires an id');
      return runtime.restoreCheckpoint(id);
    }
  }
  throw new Error(`Unknown command: ${[command, action].filter(Boolean).join(' ')}`);
}

function writeResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeError(error: unknown): void {
  const code = error instanceof RuntimeError ? error.code : 'CLI_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
}

const args = process.argv.slice(2);
let runtime: OpenControlRuntime | undefined;
try {
  const home = takeOption(args, '--home');
  runtime = OpenControlRuntime.open({ home });
  writeResult(await execute(runtime, args));
} catch (error) {
  writeError(error);
  process.exitCode = 1;
} finally {
  runtime?.close();
}
