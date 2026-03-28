import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';
import type { UserPublic } from '../../shared/types.js';

// Extend Hono context
declare module 'hono' {
  interface ContextVariableMap {
    user: UserPublic;
    userId: string;
  }
}

/**
 * JWT authentication middleware.
 * Extracts Bearer token from Authorization header and verifies it.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const config = loadConfig();

  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      username: string;
      displayName: string | null;
    };

    c.set('userId', payload.userId);
    c.set('user', {
      id: payload.userId,
      username: payload.username,
      display_name: payload.displayName,
      created_at: '',
      updated_at: '',
    });

    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
});
