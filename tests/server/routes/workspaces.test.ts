import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, closeDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import authRoutes from '../../../src/server/routes/auth.js';
import workspaceRoutes from '../../../src/server/routes/workspaces.js';

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  workspaceBaseDir: '/tmp/haydenclaw-test-workspaces',
};

function createTestApp() {
  const app = new Hono();
  app.route('/api/auth', authRoutes);
  app.route('/api/workspaces', workspaceRoutes);
  return app;
}

async function setupAndGetToken(app: Hono): Promise<string> {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  const { token } = await res.json();
  return token;
}

describe('Workspace Routes', () => {
  let app: Hono;
  let token: string;

  beforeEach(async () => {
    createTestDb();
    createConfig(TEST_CONFIG);
    app = createTestApp();
    token = await setupAndGetToken(app);
  });

  afterEach(() => {
    closeDb();
    resetConfig();
  });

  describe('POST /api/workspaces', () => {
    it('should create a workspace', async () => {
      const res = await app.request('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Test Workspace', description: 'A test workspace' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('Test Workspace');
      expect(body.description).toBe('A test workspace');
      expect(body.id).toBeDefined();
    });

    it('should reject empty name', async () => {
      const res = await app.request('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated request', async () => {
      const res = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/workspaces', () => {
    it('should list workspaces', async () => {
      // Create a workspace
      await app.request('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'WS1' }),
      });

      const res = await app.request('/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('WS1');
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('should get a specific workspace', async () => {
      const createRes = await app.request('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'WS1' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/api/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('WS1');
    });

    it('should return 404 for nonexistent workspace', async () => {
      const res = await app.request('/api/workspaces/nonexistent', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('should delete a workspace', async () => {
      const createRes = await app.request('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'WS1' }),
      });
      const { id } = await createRes.json();

      const res = await app.request(`/api/workspaces/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);

      // Verify deleted
      const getRes = await app.request(`/api/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(getRes.status).toBe(404);
    });
  });
});
