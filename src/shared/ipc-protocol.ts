import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
  SENTINEL_CLOSE,
  SENTINEL_DRAIN,
  SENTINEL_INTERRUPT,
} from './constants.js';
import type { ContainerOutput, IpcMessage } from './types.js';

/**
 * Write an IPC message file atomically (write .tmp then rename).
 */
export function writeIpcMessage(inputDir: string, message: IpcMessage): string {
  fs.mkdirSync(inputDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}.json`;
  const filepath = path.join(inputDir, filename);
  const tmpPath = `${filepath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(message));
  fs.renameSync(tmpPath, filepath);
  return filepath;
}

/**
 * Write a sentinel file to the IPC input directory.
 */
export function writeSentinel(
  inputDir: string,
  sentinel: typeof SENTINEL_CLOSE | typeof SENTINEL_DRAIN | typeof SENTINEL_INTERRUPT
): void {
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, sentinel), '');
}

/**
 * Check if a sentinel file exists and consume it (delete after reading).
 */
export function checkSentinel(
  inputDir: string,
  sentinel: string
): boolean {
  const filepath = path.join(inputDir, sentinel);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    return true;
  }
  return false;
}

/**
 * Read and consume all pending IPC message files from the input directory.
 * Files are sorted by name (timestamp prefix ensures order).
 */
export function drainIpcMessages(inputDir: string): IpcMessage[] {
  if (!fs.existsSync(inputDir)) return [];

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  const messages: IpcMessage[] = [];
  for (const file of files) {
    const filepath = path.join(inputDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      fs.unlinkSync(filepath);
      if (data.type === 'message' && data.text) {
        messages.push(data as IpcMessage);
      }
    } catch {
      // Skip malformed files
    }
  }
  return messages;
}

/**
 * Wrap a ContainerOutput as a marked stdout line.
 */
export function wrapOutput(output: ContainerOutput): string {
  return `${OUTPUT_START_MARKER}\n${JSON.stringify(output)}\n${OUTPUT_END_MARKER}\n`;
}

/**
 * Parse marked outputs from a buffer string.
 * Returns parsed outputs and the remaining unparsed buffer.
 */
export function parseOutputBuffer(buffer: string): {
  outputs: ContainerOutput[];
  remaining: string;
} {
  const outputs: ContainerOutput[] = [];
  let remaining = buffer;

  while (true) {
    const startIdx = remaining.indexOf(OUTPUT_START_MARKER);
    if (startIdx === -1) break;

    const endIdx = remaining.indexOf(OUTPUT_END_MARKER, startIdx);
    if (endIdx === -1) break;

    const json = remaining
      .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
      .trim();
    remaining = remaining.slice(endIdx + OUTPUT_END_MARKER.length);

    try {
      outputs.push(JSON.parse(json));
    } catch {
      // Skip malformed output
    }
  }

  return { outputs, remaining };
}

/**
 * Get the IPC input directory for a conversation.
 */
export function getIpcInputDir(ipcBaseDir: string, conversationId: string): string {
  return path.join(ipcBaseDir, conversationId, 'input');
}
