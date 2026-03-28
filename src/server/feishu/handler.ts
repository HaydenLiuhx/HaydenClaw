import * as lark from '@larksuiteoapi/node-sdk';
import { getLogger } from '../logger.js';
import { getConversationQueue } from '../agent/singleton.js';
import * as conversationService from '../services/conversation.js';
import * as messageService from '../services/message.js';
import * as workspaceService from '../services/workspace.js';
import { createCardState, applyStreamEvent, shouldUpdate, markUpdated, buildInitialCard, buildStreamingCard, buildFinalCard, buildErrorCard } from './cards.js';
import type { CardState } from './types.js';
import type { StreamEvent } from '../../shared/types.js';

// Active card states for streaming updates
const activeCards = new Map<string, CardState>();

/**
 * Create the Feishu event dispatcher that handles incoming messages.
 */
export function createEventDispatcher(
  client: lark.Client,
  defaultWorkspaceId: string | null
) {
  const logger = getLogger();
  const dispatcher = new lark.EventDispatcher({});

  dispatcher.register({
    'im.message.receive_v1': async (data: any) => {
      try {
        await handleMessage(client, data, defaultWorkspaceId);
      } catch (err: any) {
        logger.error({ err }, 'Error handling Feishu message');
      }
    },
  });

  return dispatcher;
}

async function handleMessage(
  client: lark.Client,
  data: any,
  defaultWorkspaceId: string | null
): Promise<void> {
  const logger = getLogger();
  const event = data.event;
  const msg = event?.message;
  if (!msg) return;

  const chatId = msg.chat_id;
  const msgType = msg.message_type;
  const senderId = event?.sender?.sender_id?.open_id;

  // Extract text content
  let text = '';
  if (msgType === 'text') {
    try {
      const content = JSON.parse(msg.content);
      text = content.text || '';
    } catch { return; }
  } else {
    // For now, only handle text messages
    logger.debug({ msgType }, 'Skipping non-text Feishu message');
    return;
  }

  // Strip @mention tags from text
  text = text.replace(/@_user_\d+/g, '').trim();
  if (!text) return;

  logger.info({ chatId, text: text.slice(0, 100) }, 'Feishu message received');

  // Find or create conversation for this Feishu chat
  let conversation = conversationService.findConversationBySource('feishu', chatId);

  if (!conversation) {
    // Need a workspace to create conversation in
    let workspaceId = defaultWorkspaceId;

    if (!workspaceId) {
      // Try to find any workspace
      const workspaces = workspaceService.listWorkspaces('');
      // If no workspaces, we can't create a conversation
      if (workspaces.length === 0) {
        logger.warn('No workspaces available for Feishu conversation');
        return;
      }
      workspaceId = workspaces[0].id;
    }

    // Find the owner of the workspace
    const workspace = workspaceService.getWorkspaceById(workspaceId);
    if (!workspace) {
      logger.warn({ workspaceId }, 'Workspace not found for Feishu conversation');
      return;
    }

    conversation = conversationService.createConversation(
      workspaceId,
      workspace.owner_id,
      `Feishu: ${chatId.slice(0, 8)}`,
      'feishu',
      chatId
    );
    logger.info({ conversationId: conversation.id, chatId }, 'Created Feishu conversation');
  }

  // Store user message
  messageService.createMessage(conversation.id, 'user', text);

  // Send initial card
  const cardState = createCardState(chatId);
  try {
    const resp = await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(buildInitialCard()),
      },
    });
    cardState.messageId = resp?.data?.message_id || null;
    activeCards.set(conversation.id, cardState);
  } catch (err: any) {
    logger.error({ err }, 'Failed to send initial Feishu card');
    // Fall back to plain text later
  }

  // Enqueue for agent processing
  const queue = getConversationQueue();
  const workspace = workspaceService.getWorkspaceById(conversation.workspace_id);

  if (queue && workspace) {
    queue.enqueue({
      conversationId: conversation.id,
      workspaceId: conversation.workspace_id,
      workspaceFolder: workspace.path,
      content: text,
      sessionId: conversation.session_id || undefined,
    }).catch(err => logger.error({ err }, 'Feishu enqueue error'));
  }
}

/**
 * Called by the agent pipeline when a stream event is emitted.
 * Updates the Feishu card if this conversation is from Feishu.
 */
export async function onFeishuStreamEvent(
  client: lark.Client,
  conversationId: string,
  event: StreamEvent
): Promise<void> {
  const cardState = activeCards.get(conversationId);
  if (!cardState || !cardState.messageId) return;

  applyStreamEvent(cardState, event);

  // Throttle updates
  if (!shouldUpdate(cardState)) return;
  markUpdated(cardState);

  try {
    await client.im.message.patch({
      path: { message_id: cardState.messageId },
      data: {
        content: JSON.stringify(buildStreamingCard(cardState)),
      },
    });
  } catch {
    // Silently fail on card update errors (rate limits etc)
  }
}

/**
 * Called when agent execution completes for a Feishu conversation.
 */
export async function onFeishuComplete(
  client: lark.Client,
  conversationId: string
): Promise<void> {
  const cardState = activeCards.get(conversationId);
  if (!cardState || !cardState.messageId) return;

  try {
    await client.im.message.patch({
      path: { message_id: cardState.messageId },
      data: {
        content: JSON.stringify(buildFinalCard(cardState)),
      },
    });
  } catch {
    // Silently fail
  }

  activeCards.delete(conversationId);
}

/**
 * Called when agent execution errors for a Feishu conversation.
 */
export async function onFeishuError(
  client: lark.Client,
  conversationId: string,
  error: string
): Promise<void> {
  const cardState = activeCards.get(conversationId);
  if (!cardState || !cardState.messageId) return;

  try {
    await client.im.message.patch({
      path: { message_id: cardState.messageId },
      data: {
        content: JSON.stringify(buildErrorCard(error)),
      },
    });
  } catch {
    // Silently fail
  }

  activeCards.delete(conversationId);
}

/**
 * Check if a conversation has an active Feishu card.
 */
export function hasActiveCard(conversationId: string): boolean {
  return activeCards.has(conversationId);
}
