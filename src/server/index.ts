import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createLogger, setLogger } from './logger.js';
import { initDb } from './db/index.js';
import { setupWebSocket } from './ws/index.js';

// Routes
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';

// Load configuration
const config = loadConfig();

// Setup logger
const logger = createLogger(config.logLevel);
setLogger(logger);

// Initialize database
initDb(config.databasePath);

// Create Hono app
const app = new Hono();

// Middleware
app.use('/*', cors());

// Routes
app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/workspaces', workspaceRoutes);
app.route('/api/conversations', conversationRoutes);
// Messages are nested under conversations
app.route('/api/conversations', messageRoutes);

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  logger.error({ err }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

// Start server
const server = serve({
  fetch: app.fetch,
  port: config.port,
});

// Setup WebSocket on the same server
setupWebSocket(server as any);

logger.info({ port: config.port }, 'HaydenClaw server started');

export { app };
