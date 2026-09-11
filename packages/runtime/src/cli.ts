#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AdapterEndpoint, Approval, ApprovalDecision, BrowserActionBatch, BrowserEndpoint, CapabilityDescriptor, DesktopActionBatch, DesktopEndpoint, Evidence, ExecutionBinding, ExecutionRequest, ExecutionResult, Mission, ModelEndpoint, ModelRequest, Programme, ProgrammeProposal, ReplanEvent, SupervisionPolicy, WorkGraph } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';
import { OpenControlRuntime } from './runtime.js';
import './supervision-extension.js';
import './security-extension.js';
import { loadDiscoveryManifests } from './discovery-loader.js';
import { createFirstPartyDesktopEndpoint } from './first-party-desktop.js';
import { executeConnectorCli } from './connectors/cli.js';
import { applyConfiguredConnector } from './connectors/apply.js';
import { runDoctor } from './doctor.js';
import { createRuntimeBackup, digestRuntimeBackup, restoreRuntimeBackup, verifyRuntimeBackup } from './backup.js';
import { resolveRuntimeHome } from './home.js';
import { CLI_OUTPUT_CONTRACT, getCliCommandCatalogue } from './cli-catalogue.js';
import { applyStateMigrations, inspectRuntimeState, planStateMigration } from './state-migrations.js';

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

async function executeMigration(homeInput: string | undefined, args: string[]): Promise<unknown> {
  if (!homeInput) throw new Error('migration requires --home <path>');
  const home = resolveRuntimeHome(homeInput);
  const action = args.shift();
  const backupPath = takeOption(args, '--backup');
  if (args.length > 0) throw new Error(`Unexpected migration arguments: ${args.join(' ')}`);
  if (action === 'inspect') {
    if (backupPath) throw new Error('migration inspect does not accept --backup');
    const inspection = inspectRuntimeState(home);
    return {
      schema: 'q1x.runtime-migration-cli.v1', action, state: inspection.state,
      sourceSchemaVersion: inspection.sourceSchemaVersion, targetSchemaVersion: inspection.targetSchemaVersion,
      steps: inspection.steps,
    };
  }
  if (action === 'compatibility') {
    if (backupPath) throw new Error('migration compatibility does not accept --backup');
    const inspection = inspectRuntimeState(home);
    return {
      schema: 'q1x.runtime-migration-cli.v1', action, state: inspection.state,
      sourceSchemaVersion: inspection.sourceSchemaVersion, targetSchemaVersion: inspection.targetSchemaVersion,
      steps: inspection.steps, compatible: !['future', 'invalid'].includes(inspection.state),
    };
  }
  if (action !== 'dry-run' && action !== 'apply') throw new Error(`Unknown migration action: ${action ?? '<missing>'}`);
  let backupDigest: string | undefined;
  if (backupPath) backupDigest = await digestRuntimeBackup(backupPath);
  const result = await applyStateMigrations(home, { dryRun: action === 'dry-run', backupPath });
  let auditReceiptId: string | undefined;
  if (action === 'apply' && result.applied) {
    const runtime = OpenControlRuntime.open({ home });
    try {
      const receipt = runtime.appendAuditReceipt('state.migration.applied', { id: 'runtime.state', kind: 'runtime-state' }, undefined, {
        migrationIds: result.steps, sourceSchemaVersion: result.sourceSchemaVersion,
        targetSchemaVersion: result.targetSchemaVersion, ...(backupDigest ? { backupDigest } : {}),
      });
      auditReceiptId = receipt.id;
    } finally {
      runtime.close();
    }
  }
  return {
    schema: 'q1x.runtime-migration-cli.v1', action, applied: result.applied,
    sourceSchemaVersion: result.sourceSchemaVersion, targetSchemaVersion: result.targetSchemaVersion,
    steps: result.steps, ...(backupDigest ? { backupDigest } : {}), ...(auditReceiptId ? { auditReceiptId } : {}),
  };
}

async function executeBackup(home: string | undefined, args: string[]): Promise<unknown> {
  const action = args.shift();
  if (action === 'create') {
    const output = requiredOption(args, '--output');
    if (args.length > 0) throw new Error(`Unexpected backup create arguments: ${args.join(' ')}`);
    const backup = await createRuntimeBackup(resolveRuntimeHome(home), output);
    return { schema: 'q1x.runtime-backup-cli.v1', action, backupPath: backup.directory, stateSchemaVersion: backup.stateSchemaVersion, valid: true };
  }
  const backupPath = args.shift();
  if (!backupPath) throw new Error(`backup ${action ?? ''}`.trim() + ' requires a backup path');
  if (args.length > 0) throw new Error(`Unexpected backup arguments: ${args.join(' ')}`);
  if (action === 'verify') {
    const verification = await verifyRuntimeBackup(backupPath);
    return { schema: 'q1x.runtime-backup-cli.v1', action, backupPath: verification.backupPath, stateSchemaVersion: verification.stateSchemaVersion, valid: verification.valid, findings: verification.findings };
  }
  if (action === 'restore') {
    if (!home) throw new Error('backup restore requires --home <empty-target>');
    const targetHome = resolveRuntimeHome(home);
    const manifest = await restoreRuntimeBackup(backupPath, targetHome);
    return { schema: 'q1x.runtime-backup-cli.v1', action, backupPath: resolve(backupPath), targetHome, stateSchemaVersion: manifest.stateSchemaVersion, valid: true, nextActions: ['audit verify', 'recovery reconcile', 'status'] };
  }
  throw new Error(`Unknown backup action: ${action ?? '<missing>'}`);
}

async function execute(runtime: OpenControlRuntime, args: string[]): Promise<unknown> {
  const command = args.shift();
  if (!command) throw new Error('A command is required');
  if (command === 'help') return { schema: 'q1x.cli-catalogue.v1', commands: getCliCommandCatalogue() };
  if (command === 'init') return runtime.getStatus();
  if (command === 'status') return runtime.getStatus(takeOption(args, '--programme'));
  if (command === 'doctor') {
    const jsonIndex = args.indexOf('--json');
    if (jsonIndex >= 0) args.splice(jsonIndex, 1);
    if (args.length > 0) throw new Error(`Unexpected doctor arguments: ${args.join(' ')}`);
    return runDoctor(runtime);
  }
  if (command === 'discover') {
    const manifests = loadDiscoveryManifests(requiredOption(args, '--manifest'));
    return runtime.discoverMany(manifests);
  }

  const action = args.shift();
  if (command === 'limits') {
    if (action !== 'show' || args.length > 0) throw new Error(`Unknown command: ${[command, action].filter(Boolean).join(' ')}`);
    return { schema: 'q1x.runtime-limits.v1', limits: runtime.limits, weakened: runtime.limitWarnings };
  }
  if (command === 'connectors') {
    if (action === 'apply') {
      const id = args.shift();
      if (!id) throw new Error('connectors apply requires a connector id');
      if (args.length > 0) throw new Error(`Unexpected connector arguments: ${args.join(' ')}`);
      return applyConfiguredConnector(runtime, id);
    }
    return executeConnectorCli(runtime.home, action, args);
  }
  if (command === 'capabilities') {
    if (action === 'put') return runtime.putCapability(readJsonFile(requiredOption(args, '--file')) as CapabilityDescriptor);
    if (action === 'list') return runtime.listCapabilities();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('capabilities get requires an id');
      return required(runtime.getCapability(id), 'Capability', id);
    }
  }
  if (command === 'bindings') {
    if (action === 'put') return runtime.putExecutionBinding(readJsonFile(requiredOption(args, '--file')) as ExecutionBinding);
    if (action === 'list') return runtime.listExecutionBindings();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('bindings get requires an id');
      return required(runtime.getExecutionBinding(id), 'Execution binding', id);
    }
  }
  if (command === 'team') {
    const programmeId = args.shift();
    if (!programmeId) throw new Error(`team ${action ?? ''}`.trim() + ' requires a programme id');
    if (action === 'form') {
      const policy = readJsonFile(requiredOption(args, '--policy')) as SupervisionPolicy;
      return runtime.formTeam(programmeId, { policy });
    }
    if (action === 'assignments') return runtime.listWorkAssignments(programmeId);
    if (action === 'plans') return runtime.listTeamPlans(programmeId);
  }
  if (command === 'assignment' && action === 'cancel') {
    const assignmentId = args.shift();
    if (!assignmentId) throw new Error('assignment cancel requires an assignment id');
    return runtime.cancelWorkAssignment(assignmentId);
  }
  if (command === 'proposal') {
    const proposal = readJsonFile(requiredOption(args, '--file')) as ProgrammeProposal;
    if (action === 'validate') return runtime.validateProgrammeProposal(proposal);
    if (action === 'accept') return runtime.acceptProgrammeProposal(proposal);
  }
  if (command === 'supervision') {
    const programmeId = args.shift();
    if (!programmeId) throw new Error(`supervision ${action ?? ''}`.trim() + ' requires a programme id');
    const policy = readJsonFile(requiredOption(args, '--policy')) as SupervisionPolicy;
    if (action === 'cycle') return runtime.runSupervisionCycle(programmeId, policy);
    if (action === 'run') {
      const maxCycles = takeOption(args, '--max-cycles');
      return runtime.superviseUntilStop(programmeId, policy, maxCycles ? { maxCycles: Number.parseInt(maxCycles, 10) } : undefined);
    }
    if (action === 'cycles') return runtime.listSupervisionCycles(programmeId);
  }
  if (command === 'approval') {
    if (action === 'request') return runtime.requestApproval(readJsonFile(requiredOption(args, '--file')) as Approval);
    if (action === 'list') return runtime.listApprovals(takeOption(args, '--programme'));
    if (action === 'show') {
      const id = args.shift(); if (!id) throw new Error('approval show requires an id');
      return required(runtime.getApproval(id), 'Approval', id);
    }
    if (action === 'decide') {
      const id = args.shift(); if (!id) throw new Error('approval decide requires an id');
      return runtime.decideApproval(id, readJsonFile(requiredOption(args, '--file')) as ApprovalDecision);
    }
    if (action === 'apply') {
      const id = args.shift(); if (!id) throw new Error('approval apply requires an id');
      return runtime.applyApproval(id);
    }
  }
  if (command === 'evidence') {
    if (action === 'record') {
      const evidence = readJsonFile(requiredOption(args, '--file')) as Evidence;
      return runtime.recordEvidence(evidence, takeOption(args, '--programme'));
    }
    if (action === 'list') return runtime.listEvidence(takeOption(args, '--programme'));
    if (action === 'show') {
      const id = args.shift(); if (!id) throw new Error('evidence show requires an id');
      return required(runtime.getEvidence(id), 'Evidence', id);
    }
  }
  if (command === 'audit') {
    if (action === 'list') return runtime.listAuditReceipts();
    if (action === 'verify') return runtime.verifyAuditChain();
  }
  if (command === 'recovery' && action === 'reconcile') {
    return runtime.reconcileInterruptedAssignments(takeOption(args, '--programme'));
  }
  if (command === 'adapters') {
    if (action === 'list') return runtime.listAdapterManifests();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('adapters get requires an id');
      return required(runtime.getAdapterManifest(id), 'Adapter manifest', id);
    }
  }
  if (command === 'adapter-endpoints') {
    if (action === 'put') return runtime.putAdapterEndpoint(readJsonFile(requiredOption(args, '--file')) as AdapterEndpoint);
    if (action === 'list') return runtime.listAdapterEndpoints();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('adapter-endpoints get requires an id');
      return required(runtime.getAdapterEndpoint(id), 'Adapter endpoint', id);
    }
  }
  if (command === 'adapter') {
    const endpointId = args.shift();
    if (!endpointId) throw new Error(`adapter ${action ?? ''}`.trim() + ' requires an endpoint id');
    if (action === 'execute') {
      return runtime.executeAdapter(endpointId, readJsonFile(requiredOption(args, '--file')) as ExecutionRequest);
    }
    if (action === 'discover') return runtime.discoverAdapterCapabilities(endpointId);
  }
  if (command === 'browser-endpoints') {
    if (action === 'put') return runtime.putBrowserEndpoint(readJsonFile(requiredOption(args, '--file')) as BrowserEndpoint);
    if (action === 'list') return runtime.listBrowserEndpoints();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('browser-endpoints get requires an id');
      return required(runtime.getBrowserEndpoint(id), 'Browser endpoint', id);
    }
  }
  if (command === 'browser') {
    const endpointId = args.shift();
    if (!endpointId) throw new Error(`browser ${action ?? ''}`.trim() + ' requires an endpoint id');
    if (action === 'run') return runtime.runBrowserBatch(endpointId, readJsonFile(requiredOption(args, '--file')) as BrowserActionBatch);
    if (action === 'discover') return runtime.discoverBrowserCapability(endpointId);
  }
  if (command === 'desktop-endpoints') {
    if (action === 'put') return runtime.putDesktopEndpoint(readJsonFile(requiredOption(args, '--file')) as DesktopEndpoint);
    if (action === 'list') return runtime.listDesktopEndpoints();
    if (action === 'get') {
      const id = args.shift(); if (!id) throw new Error('desktop-endpoints get requires an id');
      return required(runtime.getDesktopEndpoint(id), 'Desktop endpoint', id);
    }
  }
  if (command === 'desktop') {
    if (action === 'setup-first-party') {
      const endpoint = createFirstPartyDesktopEndpoint({
        id: takeOption(args, '--id'),
        name: takeOption(args, '--name'),
        outputDir: takeOption(args, '--output-dir'),
      });
      return runtime.putDesktopEndpoint(endpoint);
    }
    const endpointId = args.shift();
    if (!endpointId) throw new Error(`desktop ${action ?? ''}`.trim() + ' requires an endpoint id');
    if (action === 'run') return runtime.runDesktopBatch(endpointId, readJsonFile(requiredOption(args, '--file')) as DesktopActionBatch);
    if (action === 'discover') return runtime.discoverDesktopCapability(endpointId);
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
  process.stderr.write(`${JSON.stringify({ schema: CLI_OUTPUT_CONTRACT.errorSchema, error: { code, message } })}\n`);
}

const args = process.argv.slice(2);
let runtime: OpenControlRuntime | undefined;
try {
  const home = takeOption(args, '--home');
  if (args[0] === 'migration') {
    args.shift();
    writeResult(await executeMigration(home, args));
  } else if (args[0] === 'backup') {
    args.shift();
    writeResult(await executeBackup(home, args));
  } else {
    runtime = OpenControlRuntime.open({ home });
    writeResult(await execute(runtime, args));
  }
} catch (error) {
  writeError(error);
  process.exitCode = 1;
} finally {
  runtime?.close();
}
