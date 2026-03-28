import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb, getDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import { createLogger, setLogger } from '../../../src/server/logger.js';
import * as conversationService from '../../../src/server/services/conversation.js';
import * as workspaceService from '../../../src/server/services/workspace.js';
import * as messageService from '../../../src/server/services/message.js';

setLogger(createLogger('silent'));

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  workspaceBaseDir: '/tmp/haydenclaw-ws-test',
  ipcBaseDir: '/tmp/haydenclaw-ws-test-ipc',
};

describe('WS Handler Logic (unit)', () => {
  beforeEach(() => {
    createTestDb();
    createConfig(TEST_CONFIG);
  });

  afterEach(() => {
    closeDb();
    resetConfig();
  });

  function setupTestData() {
    const db = getDb();
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run('u1', 'admin', 'hash');
    db.prepare('INSERT INTO workspaces (id, name, path, owner_id) VALUES (?, ?, ?, ?)').run('w1', 'ws1', '/tmp/ws1', 'u1');
    db.prepare('INSERT INTO conversations (id, workspace_id, user_id) VALUES (?, ?, ?)').run('c1', 'w1', 'u1');
    return { userId: 'u1', workspaceId: 'w1', conversationId: 'c1' };
  }

  it('should create user message from WS event', () => {
    const { conversationId } = setupTestData();

    // Simulate what the WS handler does when receiving a message event
    const msg = messageService.createMessage(conversationId, 'user', 'Hello from WS');

    expect(msg).toBeDefined();
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello from WS');
  });

  it('should find conversation for WS routing', () => {
    const { conversationId } = setupTestData();
    const conv = conversationService.getConversationById(conversationId);

    expect(conv).toBeDefined();
    expect(conv!.id).toBe(conversationId);
  });

  it('should resolve workspace from conversation', () => {
    const { conversationId, workspaceId } = setupTestData();
    const conv = conversationService.getConversationById(conversationId);
    const ws = workspaceService.getWorkspaceById(conv!.workspace_id);

    expect(ws).toBeDefined();
    expect(ws!.id).toBe(workspaceId);
  });

  it('should handle nonexistent conversation gracefully', () => {
    setupTestData();
    const conv = conversationService.getConversationById('nonexistent');
    expect(conv).toBeUndefined();
  });
});
