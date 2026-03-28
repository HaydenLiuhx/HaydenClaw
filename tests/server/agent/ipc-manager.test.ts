import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IpcManager } from '../../../src/server/agent/ipc.js';
import { SENTINEL_CLOSE, SENTINEL_DRAIN, SENTINEL_INTERRUPT } from '../../../src/shared/constants.js';

describe('IpcManager', () => {
  let tmpDir: string;
  let ipcManager: IpcManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-ipcmgr-test-'));
    ipcManager = new IpcManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should get correct input dir', () => {
    const dir = ipcManager.getInputDir('conv123');
    expect(dir).toBe(path.join(tmpDir, 'conv123', 'input'));
  });

  it('should write a message file', () => {
    const filepath = ipcManager.writeMessage('conv1', 'hello world');
    expect(fs.existsSync(filepath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(content.type).toBe('message');
    expect(content.text).toBe('hello world');
  });

  it('should write message with images', () => {
    const filepath = ipcManager.writeMessage('conv1', 'look at this', [
      { data: 'base64data', mimeType: 'image/png' },
    ]);

    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(content.images).toHaveLength(1);
    expect(content.images[0].data).toBe('base64data');
  });

  it('should write close sentinel', () => {
    ipcManager.writeClose('conv1');
    const sentinelPath = path.join(tmpDir, 'conv1', 'input', SENTINEL_CLOSE);
    expect(fs.existsSync(sentinelPath)).toBe(true);
  });

  it('should write drain sentinel', () => {
    ipcManager.writeDrain('conv1');
    const sentinelPath = path.join(tmpDir, 'conv1', 'input', SENTINEL_DRAIN);
    expect(fs.existsSync(sentinelPath)).toBe(true);
  });

  it('should write interrupt sentinel', () => {
    ipcManager.writeInterrupt('conv1');
    const sentinelPath = path.join(tmpDir, 'conv1', 'input', SENTINEL_INTERRUPT);
    expect(fs.existsSync(sentinelPath)).toBe(true);
  });
});
