import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';
import { getLogger } from '../logger.js';
import type { WsClient, WsClientEvent, WsServerEvent } from './types.js';
import type { StreamEvent } from '../../shared/types.js';

const clients = new Map<WebSocket, WsClient>();

export function setupWebSocket(server: Server): WebSocketServer {
  const logger = getLogger();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    const config = loadConfig();
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
      const client: WsClient = { ws, userId: payload.userId, subscriptions: new Set() };
      clients.set(ws, client);
      logger.debug({ userId: payload.userId }, 'WebSocket client connected');
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString()) as WsClientEvent;
        handleClientEvent(ws, event);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Heartbeat: ping every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  logger.info('WebSocket server initialized');
  return wss;
}

function handleClientEvent(ws: WebSocket, event: WsClientEvent): void {
  const client = clients.get(ws);
  if (!client) return;

  switch (event.type) {
    case 'ping':
      sendToClient(ws, { type: 'pong' });
      break;
    // Subscribe/unsubscribe will be handled when we implement the message type
    // For now, any message with a conversationId auto-subscribes
    case 'message':
    case 'interrupt':
    case 'drain':
    case 'close':
      if ('conversationId' in event) {
        client.subscriptions.add(event.conversationId);
      }
      break;
  }
}

/**
 * Send a WS event to a specific client.
 */
export function sendToClient(ws: WebSocket, event: WsServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

/**
 * Broadcast a stream event to all clients subscribed to a conversation.
 */
export function broadcastStreamEvent(conversationId: string, streamEvent: StreamEvent): void {
  const event: WsServerEvent = { type: 'stream', conversationId, event: streamEvent };
  for (const [ws, client] of clients) {
    if (client.subscriptions.has(conversationId)) {
      sendToClient(ws, event);
    }
  }
}

/**
 * Broadcast message complete to subscribed clients.
 */
export function broadcastMessageComplete(conversationId: string, messageId: string): void {
  const event: WsServerEvent = { type: 'message_complete', conversationId, messageId };
  for (const [ws, client] of clients) {
    if (client.subscriptions.has(conversationId)) {
      sendToClient(ws, event);
    }
  }
}

/**
 * Broadcast error to subscribed clients.
 */
export function broadcastError(conversationId: string, error: string): void {
  const event: WsServerEvent = { type: 'error', conversationId, error };
  for (const [ws, client] of clients) {
    if (client.subscriptions.has(conversationId)) {
      sendToClient(ws, event);
    }
  }
}

/**
 * Get count of connected clients.
 */
export function getConnectedClientCount(): number {
  return clients.size;
}
