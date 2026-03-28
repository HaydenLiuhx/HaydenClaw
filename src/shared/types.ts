// ============== IPC Protocol Types ==============

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  workspaceFolder: string;
  chatId: string; // conversationId, used for IPC dir
  ipcDir: string;
  images?: ImageAttachment[];
}

export interface ContainerOutput {
  status: 'success' | 'error' | 'stream' | 'closed';
  result: string | null;
  newSessionId?: string;
  error?: string;
  streamEvent?: StreamEvent;
}

// ============== Stream Events ==============

export type StreamEventType =
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_use_start'
  | 'tool_use_end'
  | 'tool_progress'
  | 'status'
  | 'usage';

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_use_end'; toolId: string; result: string }
  | { type: 'tool_progress'; toolId: string; progress: string }
  | { type: 'status'; status: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

// ============== IPC Messages ==============

export interface IpcMessage {
  type: 'message';
  text: string;
  images?: ImageAttachment[];
}

export interface ImageAttachment {
  data: string; // base64
  mimeType?: string;
}

// ============== Database Models ==============

export interface User {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export type UserPublic = Omit<User, 'password_hash'>;

export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  source: 'web' | 'feishu';
  source_id: string | null;
  workspace_id: string;
  user_id: string;
  session_id: string | null;
  status: 'idle' | 'active' | 'error';
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: string | null; // JSON string
  created_at: string;
}

export interface Memory {
  id: string;
  workspace_id: string | null;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

// ============== WebSocket Events ==============

export type WsClientEvent =
  | { type: 'message'; conversationId: string; content: string; images?: ImageAttachment[] }
  | { type: 'interrupt'; conversationId: string }
  | { type: 'drain'; conversationId: string }
  | { type: 'close'; conversationId: string }
  | { type: 'ping' };

export type WsServerEvent =
  | { type: 'stream'; conversationId: string; event: StreamEvent }
  | { type: 'message_complete'; conversationId: string; messageId: string }
  | { type: 'error'; conversationId: string; error: string }
  | { type: 'pong' };

// ============== API Types ==============

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserPublic;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}
