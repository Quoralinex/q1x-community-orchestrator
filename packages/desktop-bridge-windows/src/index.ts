#!/usr/bin/env node
import {
  BridgeIoError,
  readBridgeEnvelope,
  writeBridgeFailure,
  writeBridgeSuccess,
  writeJsonOutput,
} from '@quoralinex/q1x-community-desktop-bridge-common';
import { createWindowsDoctor, runWindowsBridge } from './windows.js';

async function main(): Promise<void> {
  if (process.argv.includes('--doctor')) {
    writeJsonOutput(await createWindowsDoctor());
    return;
  }

  try {
    const envelope = await readBridgeEnvelope();
    if (envelope.endpoint.platform !== 'windows' && envelope.endpoint.platform !== 'any') {
      writeBridgeFailure('PLATFORM_MISMATCH', `Endpoint platform ${envelope.endpoint.platform} cannot run through the Windows bridge.`);
      process.exitCode = 2;
      return;
    }
    writeBridgeSuccess(await runWindowsBridge(envelope));
  } catch (error) {
    const code = error instanceof BridgeIoError ? error.code : 'WINDOWS_BRIDGE_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    writeBridgeFailure(code, message.slice(0, 512));
    process.exitCode = 1;
  }
}

await main();

export * from './windows.js';
