import { describe, it, expect } from 'vitest';
import {
  createCardState,
  applyStreamEvent,
  shouldUpdate,
  markUpdated,
  buildInitialCard,
  buildStreamingCard,
  buildFinalCard,
  buildErrorCard,
} from '../../../src/server/feishu/cards.js';
import type { StreamEvent } from '../../../src/shared/types.js';

describe('Feishu Card Builder', () => {
  describe('createCardState', () => {
    it('should create a new card state', () => {
      const state = createCardState('chat123');
      expect(state.chatId).toBe('chat123');
      expect(state.messageId).toBeNull();
      expect(state.buffer).toBe('');
      expect(state.thinkingText).toBe('');
      expect(state.toolCalls).toHaveLength(0);
      expect(state.status).toBe('thinking');
    });
  });

  describe('applyStreamEvent', () => {
    it('should accumulate text_delta', () => {
      const state = createCardState('chat1');
      applyStreamEvent(state, { type: 'text_delta', text: 'Hello ' });
      applyStreamEvent(state, { type: 'text_delta', text: 'world' });
      expect(state.buffer).toBe('Hello world');
      expect(state.status).toBe('responding');
    });

    it('should accumulate thinking_delta', () => {
      const state = createCardState('chat1');
      applyStreamEvent(state, { type: 'thinking_delta', text: 'Let me think...' });
      expect(state.thinkingText).toBe('Let me think...');
      expect(state.status).toBe('thinking');
    });

    it('should track tool calls', () => {
      const state = createCardState('chat1');
      applyStreamEvent(state, { type: 'tool_use_start', toolName: 'bash', toolId: 't1' });
      expect(state.toolCalls).toHaveLength(1);
      expect(state.toolCalls[0].name).toBe('bash');
      expect(state.toolCalls[0].status).toBe('running');
      expect(state.status).toBe('tool_use');

      applyStreamEvent(state, { type: 'tool_use_end', toolId: 't1', result: 'done' });
      expect(state.toolCalls[0].status).toBe('done');
    });
  });

  describe('shouldUpdate / markUpdated', () => {
    it('should allow update when enough time has passed', () => {
      const state = createCardState('chat1');
      expect(shouldUpdate(state)).toBe(true);

      markUpdated(state);
      expect(shouldUpdate(state)).toBe(false);
    });

    it('should allow update after interval', async () => {
      const state = createCardState('chat1');
      markUpdated(state);
      state.lastUpdate = Date.now() - 600; // 600ms ago
      expect(shouldUpdate(state)).toBe(true);
    });
  });

  describe('buildInitialCard', () => {
    it('should return a valid card structure', () => {
      const card = buildInitialCard() as any;
      expect(card.config.wide_screen_mode).toBe(true);
      expect(card.header.title.content).toBe('HaydenClaw');
      expect(card.elements).toBeDefined();
      expect(card.elements.length).toBeGreaterThan(0);
    });
  });

  describe('buildStreamingCard', () => {
    it('should show thinking text', () => {
      const state = createCardState('chat1');
      state.thinkingText = 'Analyzing the code...';
      state.status = 'thinking';

      const card = buildStreamingCard(state) as any;
      const content = JSON.stringify(card);
      expect(content).toContain('Thinking');
      expect(content).toContain('Analyzing the code');
    });

    it('should show response text', () => {
      const state = createCardState('chat1');
      state.buffer = 'Here is the answer';
      state.status = 'responding';

      const card = buildStreamingCard(state) as any;
      const content = JSON.stringify(card);
      expect(content).toContain('Here is the answer');
    });

    it('should show tool calls', () => {
      const state = createCardState('chat1');
      state.toolCalls = [
        { name: 'bash', id: 't1', status: 'running' },
        { name: 'read', id: 't2', status: 'done' },
      ];
      state.status = 'tool_use';

      const card = buildStreamingCard(state) as any;
      const content = JSON.stringify(card);
      expect(content).toContain('bash');
      expect(content).toContain('read');
    });
  });

  describe('buildFinalCard', () => {
    it('should set status to done', () => {
      const state = createCardState('chat1');
      state.buffer = 'Final answer';
      const card = buildFinalCard(state) as any;
      expect(state.status).toBe('done');
      expect(card.header.template).toBe('green');
    });
  });

  describe('buildErrorCard', () => {
    it('should show error message', () => {
      const card = buildErrorCard('Something went wrong') as any;
      const content = JSON.stringify(card);
      expect(content).toContain('Something went wrong');
      expect(card.header.template).toBe('red');
    });
  });
});
