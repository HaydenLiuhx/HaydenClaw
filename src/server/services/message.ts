import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import type { Message } from '../../shared/types.js';

export function createMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
): Message {
  const db = getDb();
  const id = crypto.randomBytes(8).toString('hex');
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)`
  ).run(id, conversationId, role, content, metadataJson);

  // Update conversation's updated_at
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);

  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message;
}

export function getMessagesByConversation(
  conversationId: string,
  limit: number = 100,
  before?: string
): Message[] {
  const db = getDb();

  if (before) {
    return db.prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ? AND created_at < ?
       ORDER BY created_at DESC LIMIT ?`
    ).all(conversationId, before, limit) as Message[];
  }

  return db.prepare(
    `SELECT * FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC LIMIT ?`
  ).all(conversationId, limit) as Message[];
}

export function getMessageById(id: string): Message | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

export function deleteMessage(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

export function countMessages(conversationId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
  ).get(conversationId) as { count: number };
  return row.count;
}
