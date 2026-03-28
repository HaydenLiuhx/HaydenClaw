import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, closeDb } from '../../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../../src/server/config.js';
import authRoutes from '../../../src/server/routes/auth.js';

const TEST_CONFIG = {
  anthropicApiKey: 'test-api-key',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
};

function createTestApp() {
  const app = new Hono();
  app.route('/api/auth', authRoutes);
  return app;
}

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    createTestDb();
    createConfig(TEST_CONFIG);
    app = createTestApp();
  });

  afterEach(() => {
    closeDb();
    resetConfig();
  });

  describe('GET /api/auth/status', () => {
    it('should return initialized=false when no users exist', async () => {
      const res = await app.request('/api/auth/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.initialized).toBe(false);
    });

    it('should return initialized=true after setup', async () => {
      // Setup first
      await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });

      const res = await app.request('/api/auth/status');
      const body = await res.json();
      expect(body.initialized).toBe(true);
    });
  });

  describe('POST /api/auth/setup', () => {
    it('should create initial admin user', async () => {
      const res = await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user.username).toBe('admin');
      expect(body.user.password_hash).toBeUndefined();
    });

    it('should reject setup when users already exist', async () => {
      // First setup
      await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });

      // Second setup should fail
      const res = await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin2', password: 'password456' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject short username', async () => {
      const res = await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ab', password: 'password123' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '12345' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });
    });

    it('should login with correct credentials', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user.username).toBe('admin');
    });

    it('should reject wrong password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrongpass' }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject nonexistent user', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nobody', password: 'password123' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const setupRes = await app.request('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      });
      const { token } = await setupRes.json();

      const res = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('admin');
    });

    it('should reject invalid token', async () => {
      const res = await app.request('/api/auth/me', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(res.status).toBe(401);
    });

    it('should reject missing authorization header', async () => {
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
