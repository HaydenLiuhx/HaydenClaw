import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, closeDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import authRoutes from '../../../src/server/routes/auth.js';
import workspaceRoutes from '../../../src/server/routes/workspaces.js';
import conversationRoutes from '../../../src/server/routes/conversations.js';
import messageRoutes from '../../../src/server/routes/messages.js';

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  workspaceBaseDir: '/tmp/haydenclaw-test-workspaces',
};

function createTestApp() {
  const app = new Hono();
  app.route('/api/auth', authRoutes);
  app.route('/api/workspaces', workspaceRoutes);
  app.route('/api/conversations', conversationRoutes);
  app.route('/api/conversations', messageRoutes);
  return app;
}

async function setupUser(app: Hono): Promise<string> {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  const { token } = await res.json();
  return token;
}

async function createWorkspace(app: Hono, token: string): Promise<string> {
  const res = await app.request('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Test WS' }),
  });
  const { id } = await res.json();
  return id;
}

describe('Conversation Routes', () => {
  let app: Hono;
  let token: string;
  let workspaceId: string;

  beforeEach(async () => {
    createTestDb();
    createConfig(TEST_CONFIG);
    app = createTestApp();
    token = await setupUser(app);
    workspaceId = await createWorkspace(app, token);
  });

  afterEach(() => {
    closeDb();
    resetConfig();
  });

  describe('POST /api/conversations', () => {
    it('should create a conversation', async () => {
      const res = await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, title: 'Test Chat' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('Test Chat');
      expect(body.workspace_id).toBe(workspaceId);
      expect(body.status).toBe('idle');
    });

    it('should reject missing workspaceId', async () => {
      const res = await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject nonexistent workspace', async () => {
      const res = await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: 'nonexistent' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/conversations', () => {
    it('should list conversations for a workspace', async () => {
      await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, title: 'Chat 1' }),
      });
      await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, title: 'Chat 2' }),
      });

      const res = await app.request(`/api/conversations?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should require workspaceId', async () => {
      const res = await app.request('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/conversations/:id', () => {
    it('should update conversation title', async () => {
      const createRes = await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, title: 'Original' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Updated');
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    it('should delete a conversation', async () => {
      const createRes = await app.request('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });
  });
});

describe('Message Routes', () => {
  let app: Hono;
  let token: string;
  let workspaceId: string;
  let conversationId: string;

  beforeEach(async () => {
    createTestDb();
    createConfig(TEST_CONFIG);
    app = createTestApp();
    token = await setupUser(app);
    workspaceId = await createWorkspace(app, token);

    const convRes = await app.request('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId }),
    });
    const conv = await convRes.json();
    conversationId = conv.id;
  });

  afterEach(() => {
    closeDb();
    resetConfig();
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('should create a user message', async () => {
      const res = await app.request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: 'Hello, Claude!' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role).toBe('user');
      expect(body.content).toBe('Hello, Claude!');
    });

    it('should reject empty content', async () => {
      const res = await app.request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject nonexistent conversation', async () => {
      const res = await app.request('/api/conversations/nonexistent/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: 'Hello' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('should list messages for a conversation', async () => {
      // Create messages
      await app.request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: 'Message 1' }),
      });
      await app.request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: 'Message 2' }),
      });

      const res = await app.request(`/api/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
    });
  });

  describe('DELETE /api/conversations/:id/messages/:messageId', () => {
    it('should delete a message', async () => {
      const createRes = await app.request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: 'To delete' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/api/conversations/${conversationId}/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });
  });
});
