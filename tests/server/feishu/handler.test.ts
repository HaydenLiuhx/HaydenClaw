import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb, getDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import { createLogger, setLogger } from '../../../src/server/logger.js';
import * as conversationService from '../../../src/server/services/conversation.js';

setLogger(createLogger('silent'));

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  workspaceBaseDir: '/tmp/haydenclaw-feishu-test',
  ipcBaseDir: '/tmp/haydenclaw-feishu-test-ipc',
};

describe('Feishu Handler Logic (unit)', () => {
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
  }

  it('should find conversation by feishu source_id', () => {
    setupTestData();

    // Create a feishu conversation
    const conv = conversationService.createConversation('w1', 'u1', 'Feishu Chat', 'feishu', 'oc_abc123');

    // Look up by source
    const found = conversationService.findConversationBySource('feishu', 'oc_abc123');
    expect(found).toBeDefined();
    expect(found!.id).toBe(conv.id);
    expect(found!.source).toBe('feishu');
    expect(found!.source_id).toBe('oc_abc123');
  });

  it('should return undefined for unknown feishu source_id', () => {
    setupTestData();
    const found = conversationService.findConversationBySource('feishu', 'unknown');
    expect(found).toBeUndefined();
  });

  it('should create feishu conversation with correct source', () => {
    setupTestData();
    const conv = conversationService.createConversation('w1', 'u1', 'Test', 'feishu', 'oc_xyz789');
    expect(conv.source).toBe('feishu');
    expect(conv.source_id).toBe('oc_xyz789');
  });

  it('should strip @mention tags from text', () => {
    // Test the regex pattern used in handler
    const text = '@_user_1 Hello there @_user_2';
    const stripped = text.replace(/@_user_\d+/g, '').trim();
    expect(stripped).toBe('Hello there');
  });

  it('should handle empty text after stripping mentions', () => {
    const text = '@_user_1';
    const stripped = text.replace(/@_user_\d+/g, '').trim();
    expect(stripped).toBe('');
  });
});
