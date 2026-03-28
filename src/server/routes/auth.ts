import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { loadConfig } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { BCRYPT_ROUNDS, JWT_EXPIRY } from '../../shared/constants.js';
import type { User, UserPublic, LoginResponse } from '../../shared/types.js';

const auth = new Hono();

function toPublic(user: User): UserPublic {
  const { password_hash, ...rest } = user;
  return rest;
}

/**
 * POST /api/auth/setup - Create initial admin user (only works when no users exist)
 */
auth.post('/setup', async (c) => {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

  if (existing.count > 0) {
    return c.json({ error: 'System already initialized' }, 400);
  }

  const body = await c.req.json<{ username: string; password: string; displayName?: string }>();

  if (!body.username || body.username.length < 3) {
    return c.json({ error: 'Username must be at least 3 characters' }, 400);
  }
  if (!body.password || body.password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const id = crypto.randomBytes(8).toString('hex');
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)`
  ).run(id, body.username, passwordHash, body.displayName || body.username);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
  const config = loadConfig();
  const token = jwt.sign(
    { userId: user.id, username: user.username, displayName: user.display_name },
    config.jwtSecret,
    { expiresIn: JWT_EXPIRY }
  );

  return c.json({ token, user: toPublic(user) } satisfies LoginResponse, 201);
});

/**
 * POST /api/auth/login
 */
auth.post('/login', async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as User | undefined;

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await bcrypt.compare(body.password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const config = loadConfig();
  const token = jwt.sign(
    { userId: user.id, username: user.username, displayName: user.display_name },
    config.jwtSecret,
    { expiresIn: JWT_EXPIRY }
  );

  return c.json({ token, user: toPublic(user) } satisfies LoginResponse);
});

/**
 * GET /api/auth/me - Get current user
 */
auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user');
  return c.json(user);
});

/**
 * GET /api/auth/status - Check if system is initialized
 */
auth.get('/status', (c) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return c.json({ initialized: count > 0 });
});

export default auth;
