import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IpcWatcher } from '../../src/agent/ipc-watcher.js';
import { writeIpcMessage, writeSentinel } from '../../src/shared/ipc-protocol.js';
import { SENTINEL_CLOSE, SENTINEL_INTERRUPT, SENTINEL_DRAIN } from '../../src/shared/constants.js';

describe('IpcWatcher', () => {
  let tmpDir: string;
  let watcher: IpcWatcher;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-watcher-test-'));
  });

  afterEach(() => {
    if (watcher) watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'input');
    watcher = new IpcWatcher(nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it('should detect new message files', async () => {
    watcher = new IpcWatcher(tmpDir);
    const received: any[] = [];

    watcher.on('message', (msg) => received.push(msg));

    // Write a message file
    writeIpcMessage(tmpDir, { type: 'message', text: 'hello' });

    // Wait for detection (fs.watch or poll)
    await new Promise(r => setTimeout(r, 200));

    // Manually trigger scan since fs.watch timing varies
    (watcher as any).scan();

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].text).toBe('hello');
  });

  it('should detect close sentinel', async () => {
    watcher = new IpcWatcher(tmpDir);
    const closeFn = vi.fn();

    watcher.on('close', closeFn);

    writeSentinel(tmpDir, SENTINEL_CLOSE);

    // Trigger scan
    (watcher as any).scan();

    expect(closeFn).toHaveBeenCalledOnce();
  });

  it('should detect interrupt sentinel', async () => {
    watcher = new IpcWatcher(tmpDir);
    const interruptFn = vi.fn();

    watcher.on('interrupt', interruptFn);

    writeSentinel(tmpDir, SENTINEL_INTERRUPT);
    (watcher as any).scan();

    expect(interruptFn).toHaveBeenCalledOnce();
  });

  it('should detect drain sentinel', async () => {
    watcher = new IpcWatcher(tmpDir);
    const drainFn = vi.fn();

    watcher.on('drain', drainFn);

    writeSentinel(tmpDir, SENTINEL_DRAIN);
    (watcher as any).scan();

    expect(drainFn).toHaveBeenCalledOnce();
  });

  it('should consume message files after reading', () => {
    watcher = new IpcWatcher(tmpDir);

    writeIpcMessage(tmpDir, { type: 'message', text: 'test' });
    (watcher as any).scan();

    const jsonFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(jsonFiles).toHaveLength(0);
  });

  it('should not re-process already-processed files', () => {
    watcher = new IpcWatcher(tmpDir);
    const received: any[] = [];
    watcher.on('message', (msg) => received.push(msg));

    writeIpcMessage(tmpDir, { type: 'message', text: 'once' });
    (watcher as any).scan();
    (watcher as any).scan(); // Scan again

    // Should only receive once (file already consumed)
    expect(received).toHaveLength(1);
  });

  it('should stop watching when stop() is called', () => {
    watcher = new IpcWatcher(tmpDir);
    watcher.stop();

    expect((watcher as any).closed).toBe(true);
    expect((watcher as any).watcher).toBeNull();
    expect((watcher as any).fallbackTimer).toBeNull();
  });
});
