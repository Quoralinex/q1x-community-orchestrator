import type { DesktopBatchResult } from '@quoralinex/q1x-community-sdk';
import {
  MAX_BRIDGE_BYTES,
  createBridgeFailure,
  createBridgeSuccess,
  validateBridgeEnvelope,
  type DesktopBridgeEnvelope,
} from './protocol.js';

export class BridgeIoError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BridgeIoError';
  }
}

export async function readJsonInput(
  stream: NodeJS.ReadableStream = process.stdin,
  maxBytes = MAX_BRIDGE_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunkValue of stream as AsyncIterable<Buffer | string>) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new BridgeIoError('BRIDGE_INPUT_TOO_LARGE', `Desktop bridge input exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks, bytes).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new BridgeIoError('INVALID_BRIDGE_JSON', 'Desktop bridge input must be valid JSON');
  }
}

export async function readBridgeEnvelope(
  stream: NodeJS.ReadableStream = process.stdin,
  maxBytes = MAX_BRIDGE_BYTES,
): Promise<DesktopBridgeEnvelope> {
  const value = await readJsonInput(stream, maxBytes);
  const result = validateBridgeEnvelope(value);
  if (!result.ok) {
    throw new BridgeIoError(result.code, result.message);
  }
  return result.value;
}

export function writeJsonOutput(
  value: unknown,
  stream: NodeJS.WritableStream = process.stdout,
  maxBytes = MAX_BRIDGE_BYTES,
): void {
  const text = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new BridgeIoError('BRIDGE_OUTPUT_TOO_LARGE', `Desktop bridge output exceeds ${maxBytes} bytes`);
  }
  stream.write(text);
}

export function writeBridgeSuccess(
  result: DesktopBatchResult,
  stream: NodeJS.WritableStream = process.stdout,
  maxBytes = MAX_BRIDGE_BYTES,
): void {
  writeJsonOutput(createBridgeSuccess(result), stream, maxBytes);
}

export function writeBridgeFailure(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  stream: NodeJS.WritableStream = process.stdout,
  maxBytes = MAX_BRIDGE_BYTES,
): void {
  writeJsonOutput(createBridgeFailure(code, message, details), stream, maxBytes);
}
