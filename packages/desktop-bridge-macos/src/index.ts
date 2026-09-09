#!/usr/bin/env node
import {
  BridgeIoError,
  readBridgeEnvelope,
  writeBridgeFailure,
  writeBridgeSuccess,
  writeJsonOutput,
} from '@quoralinex/q1x-community-desktop-bridge-common';
import { createMacosDoctor, runMacosBridge } from './macos.js';

async function main(): Promise<void> {
  if (process.argv.includes('--doctor')) {
    writeJsonOutput(await createMacosDoctor());
    return;
  }

  try {
    const envelope = await readBridgeEnvelope();
    if (envelope.endpoint.platform !== 'macos' && envelope.endpoint.platform !== 'any') {
      writeBridgeFailure('PLATFORM_MISMATCH', `Endpoint platform ${envelope.endpoint.platform} cannot run through the macOS bridge.`);
      process.exitCode = 2;
      return;
    }
    writeBridgeSuccess(await runMacosBridge(envelope));
  } catch (error) {
    const code = error instanceof BridgeIoError ? error.code : 'MACOS_BRIDGE_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    writeBridgeFailure(code, message.slice(0, 512));
    process.exitCode = 1;
  }
}

await main();

export * from './macos.js';
