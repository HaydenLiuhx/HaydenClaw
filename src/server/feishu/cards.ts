import type { CardState, ToolCallDisplay } from './types.js';
import type { StreamEvent } from '../../shared/types.js';
import { FEISHU_CARD_UPDATE_INTERVAL_MS, FEISHU_CARD_MD_LIMIT } from '../../shared/constants.js';

/**
 * Create a new CardState for a chat.
 */
export function createCardState(chatId: string): CardState {
  return {
    chatId,
    messageId: null,
    lastUpdate: 0,
    buffer: '',
    thinkingText: '',
    toolCalls: [],
    status: 'thinking',
  };
}

/**
 * Apply a stream event to the card state.
 */
export function applyStreamEvent(state: CardState, event: StreamEvent): void {
  switch (event.type) {
    case 'text_delta':
      state.buffer += event.text;
      state.status = 'responding';
      break;
    case 'thinking_delta':
      state.thinkingText += event.text;
      state.status = 'thinking';
      break;
    case 'tool_use_start':
      state.toolCalls.push({ name: event.toolName, id: event.toolId, status: 'running' });
      state.status = 'tool_use';
      break;
    case 'tool_use_end':
      const tc = state.toolCalls.find(t => t.id === event.toolId);
      if (tc) tc.status = 'done';
      break;
    case 'status':
      // Generic status update
      break;
  }
}

/**
 * Check if enough time has passed to send a card update.
 */
export function shouldUpdate(state: CardState): boolean {
  return Date.now() - state.lastUpdate >= FEISHU_CARD_UPDATE_INTERVAL_MS;
}

/**
 * Mark the card as updated.
 */
export function markUpdated(state: CardState): void {
  state.lastUpdate = Date.now();
}

/**
 * Build the initial "thinking" card JSON.
 */
export function buildInitialCard(): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'HaydenClaw' },
      template: 'turquoise',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**Processing your request...**' },
      },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: 'Thinking...' }],
      },
    ],
  };
}

/**
 * Build the streaming card JSON from current state.
 */
export function buildStreamingCard(state: CardState): object {
  const elements: any[] = [];

  // Thinking section (show last 300 chars)
  if (state.thinkingText && state.status === 'thinking') {
    const thinkingPreview = state.thinkingText.length > 300
      ? '...' + state.thinkingText.slice(-300)
      : state.thinkingText;
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**Thinking...**\n${escapeMarkdown(thinkingPreview)}`,
      },
    });
    elements.push({ tag: 'hr' });
  }

  // Tool calls
  const activeTools = state.toolCalls.filter(t => t.status === 'running');
  const doneTools = state.toolCalls.filter(t => t.status === 'done');

  if (doneTools.length > 0) {
    const toolSummary = doneTools.map(t => `\`${t.name}\``).join(', ');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `Completed: ${toolSummary}` },
    });
  }

  if (activeTools.length > 0) {
    for (const tool of activeTools) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `Running: \`${tool.name}\`...` },
      });
    }
    elements.push({ tag: 'hr' });
  }

  // Main response text (truncate if too long)
  if (state.buffer) {
    const text = state.buffer.length > FEISHU_CARD_MD_LIMIT
      ? state.buffer.slice(-FEISHU_CARD_MD_LIMIT) + '\n\n*(truncated)*'
      : state.buffer;
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: text },
    });
  }

  // Status indicator
  const statusText = state.status === 'done'
    ? 'Completed'
    : state.status === 'error'
    ? 'Error'
    : 'Generating...';

  const statusEmoji = state.status === 'done'
    ? ''
    : state.status === 'error'
    ? ''
    : '';

  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: `${statusEmoji} ${statusText}` }],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'HaydenClaw' },
      template: state.status === 'error' ? 'red' : state.status === 'done' ? 'green' : 'turquoise',
    },
    elements,
  };
}

/**
 * Build the final completed card.
 */
export function buildFinalCard(state: CardState): object {
  state.status = 'done';
  return buildStreamingCard(state);
}

/**
 * Build an error card.
 */
export function buildErrorCard(error: string): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'HaydenClaw' },
      template: 'red',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**Error:** ${escapeMarkdown(error)}` },
      },
    ],
  };
}

/**
 * Escape special markdown characters for Feishu lark_md.
 */
function escapeMarkdown(text: string): string {
  // Feishu lark_md is mostly compatible with standard markdown
  // but we need to be careful with some characters
  return text;
}
