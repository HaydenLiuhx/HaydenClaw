import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import * as workspaceService from '../services/workspace.js';

const workspaces = new Hono();

// All workspace routes require auth
workspaces.use('/*', authMiddleware);

/**
 * GET /api/workspaces - List user's workspaces
 */
workspaces.get('/', (c) => {
  const userId = c.get('userId');
  const items = workspaceService.listWorkspaces(userId);
  return c.json({ items });
});

/**
 * POST /api/workspaces - Create a workspace
 */
workspaces.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name: string; description?: string }>();

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: 'Workspace name is required' }, 400);
  }

  const workspace = workspaceService.createWorkspace(
    body.name.trim(),
    body.description || null,
    userId
  );

  return c.json(workspace, 201);
});

/**
 * GET /api/workspaces/:id - Get a workspace
 */
workspaces.get('/:id', (c) => {
  const workspace = workspaceService.getWorkspaceById(c.req.param('id'));
  if (!workspace) {
    return c.json({ error: 'Workspace not found' }, 404);
  }
  return c.json(workspace);
});

/**
 * DELETE /api/workspaces/:id - Delete a workspace
 */
workspaces.delete('/:id', (c) => {
  const deleted = workspaceService.deleteWorkspace(c.req.param('id'));
  if (!deleted) {
    return c.json({ error: 'Workspace not found' }, 404);
  }
  return c.json({ ok: true });
});

export default workspaces;
