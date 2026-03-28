import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentManager } from '../../../src/server/agent/manager.js';
import { IpcManager } from '../../../src/server/agent/ipc.js';
import { ConversationQueue } from '../../../src/server/agent/queue.js';
import { createTestDb, closeDb, getDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import { createLogger, setLogger } from '../../../src/server/logger.js';

setLogger(createLogger('silent'));

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  workspaceBaseDir: '/tmp/haydenclaw-test-ws',
  ipcBaseDir: '/tmp/haydenclaw-test-ipc',
};

describe('ConversationQueue', () => {
  let tmpDir: string;
  let manager: AgentManager;
  let ipcManager: IpcManager;
  let queue: ConversationQueue;
  let scriptPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-queue-test-'));
    createTestDb();
    createConfig(TEST_CONFIG);

    // Create a quick test agent script
    scriptPath = path.join(tmpDir, 'quick-agent.mjs');
    fs.writeFileSync(scriptPath, `
      const chunks = [];
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', c => chunks.push(c));
      process.stdin.on('end', () => {
        const input = JSON.parse(chunks.join(''));
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream', result: null,
          streamEvent: { type: 'text_delta', text: 'Reply to: ' + input.prompt }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({ status: 'success', result: 'Done' }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
      });
    `);

    manager = new AgentManager(2, 'process', 'test-api-key', scriptPath);
    ipcManager = new IpcManager(path.join(tmpDir, 'ipc'));
    queue = new ConversationQueue(manager, ipcManager, path.join(tmpDir, 'ipc'), path.join(tmpDir, 'workspaces'));
  });

  afterEach(() => {
    manager.killAll();
    closeDb();
    resetConfig();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupTestData() {
    const db = getDb();
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run('u1', 'admin', 'hash');
    db.prepare('INSERT INTO workspaces (id, name, path, owner_id) VALUES (?, ?, ?, ?)').run(
      'w1', 'Test', path.join(tmpDir, 'workspaces', 'w1'), 'u1'
    );
    db.prepare('INSERT INTO conversations (id, workspace_id, user_id) VALUES (?, ?, ?)').run('c1', 'w1', 'u1');
    fs.mkdirSync(path.join(tmpDir, 'workspaces', 'w1'), { recursive: true });
    return { userId: 'u1', workspaceId: 'w1', conversationId: 'c1' };
  }

  it('should enqueue and process a message', async () => {
    const { conversationId, workspaceId } = setupTestData();
    const wsFolder = path.join(tmpDir, 'workspaces', 'w1');

    // Enqueue a message
    await queue.enqueue({
      conversationId,
      workspaceId,
      workspaceFolder: wsFolder,
      content: 'Hello agent',
    });

    // Wait for agent to complete
    await new Promise(r => setTimeout(r, 2000));

    // Conversation should be back to idle
    const db = getDb();
    const conv = db.prepare('SELECT status FROM conversations WHERE id = ?').get(conversationId) as any;
    expect(conv.status).toBe('idle');

    // Should have stored an assistant message
    const messages = db.prepare("SELECT * FROM messages WHERE conversation_id = ? AND role = 'assistant'").all(conversationId);
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should inject IPC message for already-running agent', async () => {
    const { conversationId, workspaceId } = setupTestData();
    const wsFolder = path.join(tmpDir, 'workspaces', 'w1');

    // Use a slow agent that waits for IPC
    const slowScript = path.join(tmpDir, 'slow-ipc-agent.mjs');
    fs.writeFileSync(slowScript, `
      process.stdin.resume();
      process.stdin.on('end', () => {});
      setTimeout(() => {
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({ status: 'success', result: 'done' }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
        process.exit(0);
      }, 1500);
    `);
    const slowManager = new AgentManager(2, 'process', 'test-api-key', slowScript);
    const slowQueue = new ConversationQueue(slowManager, ipcManager, path.join(tmpDir, 'ipc'), path.join(tmpDir, 'workspaces'));

    // First message starts the agent
    await slowQueue.enqueue({
      conversationId, workspaceId, workspaceFolder: wsFolder, content: 'First',
    });

    // Agent should be running
    expect(slowManager.isRunning(conversationId)).toBe(true);

    // Second message should inject via IPC (not spawn new agent)
    await slowQueue.enqueue({
      conversationId, workspaceId, workspaceFolder: wsFolder, content: 'Second via IPC',
    });

    // Still only one agent running
    expect(slowManager.runningCount).toBe(1);

    // Check IPC file was created
    const ipcInputDir = path.join(tmpDir, 'ipc', conversationId, 'input');
    const files = fs.readdirSync(ipcInputDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(1);

    // Wait for agent to finish
    await new Promise(r => setTimeout(r, 2000));
    slowManager.killAll();
    // Wait for process cleanup
    await new Promise(r => setTimeout(r, 500));
  });

  it('should handle interrupt', async () => {
    const { conversationId, workspaceId } = setupTestData();
    const wsFolder = path.join(tmpDir, 'workspaces', 'w1');

    // Use a slow agent
    const slowScript = path.join(tmpDir, 'slow-int-agent.mjs');
    fs.writeFileSync(slowScript, `
      process.stdin.resume();
      setTimeout(() => process.exit(0), 10000);
    `);
    const slowManager = new AgentManager(2, 'process', 'test-api-key', slowScript);
    const slowQueue = new ConversationQueue(slowManager, ipcManager, path.join(tmpDir, 'ipc'), path.join(tmpDir, 'workspaces'));

    await slowQueue.enqueue({
      conversationId, workspaceId, workspaceFolder: wsFolder, content: 'test',
    });

    expect(slowManager.isRunning(conversationId)).toBe(true);

    // Send interrupt
    slowQueue.interrupt(conversationId);

    // Check interrupt sentinel was created
    const ipcInputDir = path.join(tmpDir, 'ipc', conversationId, 'input');
    const hasInterrupt = fs.existsSync(path.join(ipcInputDir, '_interrupt'));
    expect(hasInterrupt).toBe(true);

    slowManager.killAll();
    // Wait for process cleanup to avoid DB access after close
    await new Promise(r => setTimeout(r, 500));
  });
});
