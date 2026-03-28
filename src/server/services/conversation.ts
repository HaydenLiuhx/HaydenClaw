import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import type { Conversation } from '../../shared/types.js';

export function createConversation(
  workspaceId: string,
  userId: string,
  title?: string,
  source: 'web' | 'feishu' = 'web',
  sourceId?: string
): Conversation {
  const db = getDb();
  const id = crypto.randomBytes(8).toString('hex');

  db.prepare(
    `INSERT INTO conversations (id, title, source, source_id, workspace_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title || 'New Chat', source, sourceId || null, workspaceId, userId);

  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation;
}

export function getConversationById(id: string): Conversation | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined;
}

export function listConversations(
  workspaceId: string,
  limit: number = 50,
  offset: number = 0
): { items: Conversation[]; total: number } {
  const db = getDb();

  const items = db.prepare(
    `SELECT * FROM conversations WHERE workspace_id = ?
     ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(workspaceId, limit, offset) as Conversation[];

  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM conversations WHERE workspace_id = ?'
  ).get(workspaceId) as { total: number };

  return { items, total };
}

export function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'title' | 'status' | 'session_id'>>
): Conversation | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.session_id !== undefined) {
    fields.push('session_id = ?');
    values.push(updates.session_id);
  }

  if (fields.length === 0) return getConversationById(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getConversationById(id);
}

export function deleteConversation(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function findConversationBySource(source: string, sourceId: string): Conversation | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM conversations WHERE source = ? AND source_id = ?'
  ).get(source, sourceId) as Conversation | undefined;
}
