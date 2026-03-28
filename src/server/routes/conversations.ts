import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import * as conversationService from '../services/conversation.js';
import * as workspaceService from '../services/workspace.js';

const conversations = new Hono();

conversations.use('/*', authMiddleware);

/**
 * GET /api/conversations - List conversations (filtered by workspaceId)
 */
conversations.get('/', (c) => {
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ error: 'workspaceId query parameter is required' }, 400);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = parseInt(c.req.query('offset') || '0');

  const result = conversationService.listConversations(workspaceId, limit, offset);
  return c.json(result);
});

/**
 * POST /api/conversations - Create a conversation
 */
conversations.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ workspaceId: string; title?: string }>();

  if (!body.workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  const workspace = workspaceService.getWorkspaceById(body.workspaceId);
  if (!workspace) {
    return c.json({ error: 'Workspace not found' }, 404);
  }

  const conversation = conversationService.createConversation(
    body.workspaceId,
    userId,
    body.title
  );

  return c.json(conversation, 201);
});

/**
 * GET /api/conversations/:id - Get a conversation
 */
conversations.get('/:id', (c) => {
  const conversation = conversationService.getConversationById(c.req.param('id'));
  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }
  return c.json(conversation);
});

/**
 * PATCH /api/conversations/:id - Update a conversation
 */
conversations.patch('/:id', async (c) => {
  const body = await c.req.json<{ title?: string; status?: string }>();
  const updated = conversationService.updateConversation(c.req.param('id'), {
    title: body.title,
    status: body.status as 'idle' | 'active' | 'error' | undefined,
  });

  if (!updated) {
    return c.json({ error: 'Conversation not found' }, 404);
  }
  return c.json(updated);
});

/**
 * DELETE /api/conversations/:id - Delete a conversation
 */
conversations.delete('/:id', (c) => {
  const deleted = conversationService.deleteConversation(c.req.param('id'));
  if (!deleted) {
    return c.json({ error: 'Conversation not found' }, 404);
  }
  return c.json({ ok: true });
});

export default conversations;
