import type { WebSocket } from 'ws';
import type { WsClientEvent, WsServerEvent } from '../../shared/types.js';

export interface WsClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // conversationIds
}

export type { WsClientEvent, WsServerEvent };
