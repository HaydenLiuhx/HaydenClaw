import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { loadConfig } from '../config.js';
import type { Workspace } from '../../shared/types.js';

export function createWorkspace(name: string, description: string | null, ownerId: string): Workspace {
  const db = getDb();
  const config = loadConfig();
  const id = crypto.randomBytes(8).toString('hex');
  const workspacePath = path.join(config.workspaceBaseDir, id);

  // Create workspace directory
  fs.mkdirSync(workspacePath, { recursive: true });

  const stmt = db.prepare(
    `INSERT INTO workspaces (id, name, path, description, owner_id) VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(id, name, workspacePath, description, ownerId);

  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace;
}

export function getWorkspaceById(id: string): Workspace | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | undefined;
}

export function listWorkspaces(ownerId: string): Workspace[] {
  const db = getDb();
  return db.prepare('SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as Workspace[];
}

export function deleteWorkspace(id: string): boolean {
  const db = getDb();
  const workspace = getWorkspaceById(id);
  if (!workspace) return false;

  // Delete workspace and cascade (conversations -> messages)
  db.prepare('DELETE FROM conversations WHERE workspace_id = ?').run(id);
  db.prepare('DELETE FROM memory WHERE workspace_id = ?').run(id);
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);

  // Optionally clean up filesystem
  if (fs.existsSync(workspace.path)) {
    fs.rmSync(workspace.path, { recursive: true, force: true });
  }

  return true;
}
