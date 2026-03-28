import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import * as messageService from '../services/message.js';
import * as conversationService from '../services/conversation.js';
import * as workspaceService from '../services/workspace.js';
import { getConversationQueue } from '../agent/singleton.js';

const messages = new Hono();

messages.use('/*', authMiddleware);

/**
 * GET /api/conversations/:conversationId/messages - List messages
 */
messages.get('/:conversationId/messages', (c) => {
  const conversationId = c.req.param('conversationId');
  const conversation = conversationService.getConversationById(conversationId);

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 200);
  const before = c.req.query('before');

  const items = messageService.getMessagesByConversation(conversationId, limit, before);
  return c.json({ items });
});

/**
 * POST /api/conversations/:conversationId/messages - Send a message
 * This creates the user message and will later trigger agent execution.
 */
messages.post('/:conversationId/messages', async (c) => {
  const conversationId = c.req.param('conversationId');
  const conversation = conversationService.getConversationById(conversationId);

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const body = await c.req.json<{ content: string; images?: Array<{ data: string; mimeType?: string }> }>();

  if (!body.content || body.content.trim().length === 0) {
    return c.json({ error: 'Message content is required' }, 400);
  }

  const metadata = body.images ? { images: body.images } : undefined;
  const message = messageService.createMessage(
    conversationId,
    'user',
    body.content.trim(),
    metadata
  );

  // Trigger agent execution via ConversationQueue
  const queue = getConversationQueue();
  if (queue) {
    const workspace = workspaceService.getWorkspaceById(conversation.workspace_id);
    if (workspace) {
      queue.enqueue({
        conversationId,
        workspaceId: conversation.workspace_id,
        workspaceFolder: workspace.path,
        content: body.content.trim(),
        sessionId: conversation.session_id || undefined,
        images: body.images,
      }).catch((err) => {
        // Non-blocking: agent spawn failure is handled via WS
        console.error('Queue enqueue error:', err);
      });
    }
  }

  return c.json(message, 201);
});

/**
 * DELETE /api/conversations/:conversationId/messages/:messageId - Delete a message
 */
messages.delete('/:conversationId/messages/:messageId', (c) => {
  const deleted = messageService.deleteMessage(c.req.param('messageId'));
  if (!deleted) {
    return c.json({ error: 'Message not found' }, 404);
  }
  return c.json({ ok: true });
});

export default messages;
