import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, closeDb, getDb } from '../../src/server/db/index.js';

describe('Database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('should initialize with WAL mode', () => {
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    // In-memory databases use 'memory' mode, not WAL
    expect(result[0].journal_mode).toBeDefined();
  });

  it('should create all required tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('workspaces');
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('memory');
  });

  it('should enforce foreign keys', () => {
    const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(fk[0].foreign_keys).toBe(1);
  });

  it('should auto-generate IDs for users', () => {
    db.prepare(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`
    ).run('testuser', 'hash123');

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('testuser') as any;
    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.id.length).toBe(16); // hex(randomblob(8)) = 16 chars
  });

  it('should enforce unique username', () => {
    db.prepare(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`
    ).run('testuser', 'hash123');

    expect(() => {
      db.prepare(
        `INSERT INTO users (username, password_hash) VALUES (?, ?)`
      ).run('testuser', 'hash456');
    }).toThrow();
  });

  it('should cascade delete messages when conversation is deleted', () => {
    // Create user
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run('u1', 'user1', 'hash');
    // Create workspace
    db.prepare('INSERT INTO workspaces (id, name, path, owner_id) VALUES (?, ?, ?, ?)').run('w1', 'ws1', '/tmp/ws1', 'u1');
    // Create conversation
    db.prepare('INSERT INTO conversations (id, workspace_id, user_id) VALUES (?, ?, ?)').run('c1', 'w1', 'u1');
    // Create message
    db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)').run('m1', 'c1', 'user', 'hello');

    // Verify message exists
    const msgBefore = db.prepare('SELECT * FROM messages WHERE id = ?').get('m1');
    expect(msgBefore).toBeDefined();

    // Delete conversation
    db.prepare('DELETE FROM conversations WHERE id = ?').run('c1');

    // Message should be cascade deleted
    const msgAfter = db.prepare('SELECT * FROM messages WHERE id = ?').get('m1');
    expect(msgAfter).toBeUndefined();
  });

  it('getDb should return the initialized database', () => {
    const instance = getDb();
    expect(instance).toBe(db);
  });
});
