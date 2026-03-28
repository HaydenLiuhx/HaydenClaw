import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Hono } from 'hono';
import { createTestDb, closeDb, getDb } from '../../src/server/db/index.js';
import { createConfig, resetConfig } from '../../src/server/config.js';
import { createLogger, setLogger } from '../../src/server/logger.js';
import { initAgentPipeline, getConversationQueue } from '../../src/server/agent/singleton.js';
import authRoutes from '../../src/server/routes/auth.js';
import workspaceRoutes from '../../src/server/routes/workspaces.js';
import conversationRoutes from '../../src/server/routes/conversations.js';
import messageRoutes from '../../src/server/routes/messages.js';

setLogger(createLogger('silent'));

describe('E2E: Conversation Flow', () => {
  let app: Hono;
  let token: string;
  let tmpDir: string;
  let scriptPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-e2e-'));

    // Create a mock agent that echoes back
    scriptPath = path.join(tmpDir, 'echo-agent.mjs');
    fs.writeFileSync(scriptPath, `
      const chunks = [];
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', c => chunks.push(c));
      process.stdin.on('end', () => {
        const input = JSON.parse(chunks.join(''));

        // Emit thinking
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream', result: null,
          streamEvent: { type: 'thinking_delta', text: 'Processing request...' }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');

        // Emit tool use
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream', result: null,
          streamEvent: { type: 'tool_use_start', toolName: 'bash', toolId: 'tool1' }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');

        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream', result: null,
          streamEvent: { type: 'tool_use_end', toolId: 'tool1', result: 'ls output' }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');

        // Emit text response
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'stream', result: null,
          streamEvent: { type: 'text_delta', text: 'Echo: ' + input.prompt }
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');

        // Final result
        process.stdout.write('===OUTPUT_START===\\n');
        process.stdout.write(JSON.stringify({
          status: 'success',
          result: 'Echo: ' + input.prompt,
          newSessionId: 'session-123'
        }));
        process.stdout.write('\\n===OUTPUT_END===\\n');
      });
    `);

    createTestDb();
    createConfig({
      anthropicApiKey: 'test-key',
      jwtSecret: 'test-jwt-secret-at-least-16-chars',
      workspaceBaseDir: path.join(tmpDir, 'workspaces'),
      ipcBaseDir: path.join(tmpDir, 'ipc'),
      maxConcurrentAgents: 2,
      agentMode: 'process',
    });

    // Init agent pipeline with our mock script
    const { agentManager } = initAgentPipeline(createConfig({
      anthropicApiKey: 'test-key',
      jwtSecret: 'test-jwt-secret-at-least-16-chars',
      workspaceBaseDir: path.join(tmpDir, 'workspaces'),
      ipcBaseDir: path.join(tmpDir, 'ipc'),
      maxConcurrentAgents: 2,
      agentMode: 'process',
    }));
    // Override the script path
    (agentManager as any).agentScriptPath = scriptPath;

    app = new Hono();
    app.route('/api/auth', authRoutes);
    app.route('/api/workspaces', workspaceRoutes);
    app.route('/api/conversations', conversationRoutes);
    app.route('/api/conversations', messageRoutes);

    // Setup admin user
    const setupRes = await app.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    const setupBody = await setupRes.json();
    token = setupBody.token;
  });

  afterAll(() => {
    closeDb();
    resetConfig();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  it('should complete full flow: workspace -> conversation -> message -> agent response', async () => {
    // 1. Create workspace
    const wsRes = await app.request('/api/workspaces', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'E2E Test Workspace' }),
    });
    expect(wsRes.status).toBe(201);
    const workspace = await wsRes.json();
    expect(workspace.name).toBe('E2E Test Workspace');

    // 2. Create conversation
    const convRes = await app.request('/api/conversations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ workspaceId: workspace.id, title: 'E2E Test Chat' }),
    });
    expect(convRes.status).toBe(201);
    const conversation = await convRes.json();
    expect(conversation.title).toBe('E2E Test Chat');
    expect(conversation.status).toBe('idle');

    // 3. Send message (triggers agent)
    const msgRes = await app.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'Hello E2E test!' }),
    });
    expect(msgRes.status).toBe(201);
    const userMsg = await msgRes.json();
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Hello E2E test!');

    // 4. Wait for agent to process
    await new Promise(r => setTimeout(r, 3000));

    // 5. Verify messages stored
    const msgsRes = await app.request(`/api/conversations/${conversation.id}/messages`, {
      headers: authHeaders(),
    });
    expect(msgsRes.status).toBe(200);
    const { items: messages } = await msgsRes.json();

    // Should have user message + assistant message
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    expect(userMessages).toHaveLength(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[0].content).toContain('Echo: Hello E2E test!');

    // 6. Verify conversation has session ID updated
    const convGetRes = await app.request(`/api/conversations/${conversation.id}`, {
      headers: authHeaders(),
    });
    const updatedConv = await convGetRes.json();
    expect(updatedConv.status).toBe('idle');
    expect(updatedConv.session_id).toBe('session-123');
  });

  it('should handle multiple conversations in parallel', async () => {
    // Create workspace
    const wsRes = await app.request('/api/workspaces', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Parallel Test' }),
    });
    const workspace = await wsRes.json();

    // Create 2 conversations
    const conv1Res = await app.request('/api/conversations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ workspaceId: workspace.id, title: 'Chat 1' }),
    });
    const conv1 = await conv1Res.json();

    const conv2Res = await app.request('/api/conversations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ workspaceId: workspace.id, title: 'Chat 2' }),
    });
    const conv2 = await conv2Res.json();

    // Send messages to both
    await app.request(`/api/conversations/${conv1.id}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'Message to chat 1' }),
    });

    await app.request(`/api/conversations/${conv2.id}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'Message to chat 2' }),
    });

    // Wait for both to process
    await new Promise(r => setTimeout(r, 4000));

    // Both should have assistant responses
    const msgs1Res = await app.request(`/api/conversations/${conv1.id}/messages`, { headers: authHeaders() });
    const msgs2Res = await app.request(`/api/conversations/${conv2.id}/messages`, { headers: authHeaders() });
    const { items: msgs1 } = await msgs1Res.json();
    const { items: msgs2 } = await msgs2Res.json();

    expect(msgs1.some((m: any) => m.role === 'assistant')).toBe(true);
    expect(msgs2.some((m: any) => m.role === 'assistant')).toBe(true);
  });
});
