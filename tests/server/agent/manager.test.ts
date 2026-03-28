import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentManager } from '../../../src/server/agent/manager.js';
import { createLogger, setLogger } from '../../../src/server/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Set up a silent logger for tests
setLogger(createLogger('silent'));

describe('AgentManager', () => {
  let manager: AgentManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-manager-test-'));
    // Use a simple echo script as the agent for testing
    manager = new AgentManager(2, 'process', 'test-api-key');
  });

  afterEach(() => {
    manager.killAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should track available slots', () => {
    expect(manager.availableSlots).toBe(2);
    expect(manager.runningCount).toBe(0);
  });

  it('should report isRunning correctly', () => {
    expect(manager.isRunning('conv1')).toBe(false);
  });

  it('should spawn a process agent and receive output', async () => {
    const ipcDir = path.join(tmpDir, 'ipc', 'conv1');
    const wsDir = path.join(tmpDir, 'ws', 'conv1');
    fs.mkdirSync(ipcDir, { recursive: true });
    fs.mkdirSync(wsDir, { recursive: true });

    // Create a simple test script that outputs in the expected format
    const scriptPath = path.join(tmpDir, 'test-agent.mjs');
    fs.writeFileSync(scriptPath, `
      const input = [];
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => input.push(chunk));
      process.stdin.on('end', () => {
        const data = JSON.parse(input.join(''));
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream',
          result: null,
          streamEvent: { type: 'text_delta', text: 'Hello from test agent' }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'success',
          result: 'Done'
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
      });
    `);

    // Override the agent script path
    const customManager = new AgentManager(2, 'process', 'test-api-key', scriptPath);

    const outputs: any[] = [];

    await new Promise<void>((resolve) => {
      customManager.spawnAgent(
        {
          conversationId: 'conv1',
          prompt: 'Hello',
          workspaceFolder: wsDir,
          ipcDir,
        },
        (output) => outputs.push(output),
        (code) => {
          expect(code).toBe(0);
          resolve();
        }
      );
    });

    expect(outputs.length).toBeGreaterThanOrEqual(1);
    const streamOutput = outputs.find(o => o.streamEvent?.type === 'text_delta');
    expect(streamOutput).toBeDefined();
    expect(streamOutput.streamEvent.text).toBe('Hello from test agent');

    const successOutput = outputs.find(o => o.status === 'success');
    expect(successOutput).toBeDefined();
    expect(successOutput.result).toBe('Done');
  });

  it('should enforce max concurrent limit', async () => {
    const ipcDir1 = path.join(tmpDir, 'ipc', 'c1');
    const ipcDir2 = path.join(tmpDir, 'ipc', 'c2');
    const ipcDir3 = path.join(tmpDir, 'ipc', 'c3');
    const ws1 = path.join(tmpDir, 'ws', 'c1');
    const ws2 = path.join(tmpDir, 'ws', 'c2');
    const ws3 = path.join(tmpDir, 'ws', 'c3');

    // Create a long-running script
    const scriptPath = path.join(tmpDir, 'slow-agent.mjs');
    fs.writeFileSync(scriptPath, `
      process.stdin.resume();
      setTimeout(() => process.exit(0), 5000);
    `);

    const slowManager = new AgentManager(2, 'process', 'test-api-key', scriptPath);

    // Spawn 2 agents (should succeed)
    await slowManager.spawnAgent(
      { conversationId: 'c1', prompt: 'test', workspaceFolder: ws1, ipcDir: ipcDir1 },
      () => {}, () => {}
    );
    await slowManager.spawnAgent(
      { conversationId: 'c2', prompt: 'test', workspaceFolder: ws2, ipcDir: ipcDir2 },
      () => {}, () => {}
    );

    expect(slowManager.availableSlots).toBe(0);

    // Third should throw
    await expect(
      slowManager.spawnAgent(
        { conversationId: 'c3', prompt: 'test', workspaceFolder: ws3, ipcDir: ipcDir3 },
        () => {}, () => {}
      )
    ).rejects.toThrow('No available agent slots');

    slowManager.killAll();
  });

  it('should kill a running agent', async () => {
    const scriptPath = path.join(tmpDir, 'sleep-agent.mjs');
    fs.writeFileSync(scriptPath, `
      process.stdin.resume();
      setTimeout(() => process.exit(0), 10000);
    `);

    const killManager = new AgentManager(2, 'process', 'test-api-key', scriptPath);
    const wsDir = path.join(tmpDir, 'ws', 'kill');
    const ipcDir = path.join(tmpDir, 'ipc', 'kill');

    await new Promise<void>((resolve) => {
      killManager.spawnAgent(
        { conversationId: 'kill-test', prompt: 'test', workspaceFolder: wsDir, ipcDir },
        () => {},
        () => resolve()
      );

      // Kill after spawn
      setTimeout(() => {
        expect(killManager.isRunning('kill-test')).toBe(true);
        killManager.kill('kill-test');
      }, 100);
    });

    expect(killManager.isRunning('kill-test')).toBe(false);
    expect(killManager.availableSlots).toBe(2);
  });
});
