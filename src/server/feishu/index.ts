import * as lark from '@larksuiteoapi/node-sdk';
import { getLogger } from '../logger.js';
import { createEventDispatcher } from './handler.js';
import type { FeishuConfig } from './types.js';

let _client: lark.Client | null = null;
let _wsClient: any | null = null;

/**
 * Initialize the Feishu client and start WebSocket long connection.
 */
export function initFeishu(config: FeishuConfig, defaultWorkspaceId: string | null): lark.Client | null {
  const logger = getLogger();

  if (!config.appId || !config.appSecret) {
    logger.info('Feishu not configured (missing appId or appSecret), skipping');
    return null;
  }

  _client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    disableTokenCache: false,
  });

  const dispatcher = createEventDispatcher(_client, defaultWorkspaceId);

  // Use WebSocket long connection (no public URL needed)
  _wsClient = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    eventDispatcher: dispatcher,
    loggerLevel: lark.LoggerLevel.WARN,
  });

  _wsClient.start();
  logger.info('Feishu WebSocket client started');

  return _client;
}

/**
 * Get the Feishu client instance.
 */
export function getFeishuClient(): lark.Client | null {
  return _client;
}

/**
 * Stop the Feishu WebSocket connection.
 */
export function stopFeishu(): void {
  // WSClient doesn't have a standard stop method in all SDK versions
  // The connection will close when the process exits
  _wsClient = null;
  _client = null;
}
