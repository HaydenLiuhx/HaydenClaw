import type { StreamEvent } from '../../shared/types.js';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

export interface CardState {
  chatId: string;
  messageId: string | null; // null until initial card is sent
  lastUpdate: number;
  buffer: string;
  thinkingText: string;
  toolCalls: ToolCallDisplay[];
  status: 'thinking' | 'tool_use' | 'responding' | 'done' | 'error';
}

export interface ToolCallDisplay {
  name: string;
  id: string;
  status: 'running' | 'done';
}
