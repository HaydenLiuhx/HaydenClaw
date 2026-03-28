import { create } from 'zustand';
import { api } from '../api/client.js';
import { wsClient } from '../api/ws.js';

interface StreamingState {
  active: boolean;
  text: string;
  thinking: string;
  currentTool: { name: string; id: string } | null;
}

interface MessageState {
  messages: Record<string, any[]>;
  streaming: Record<string, StreamingState>;
  loading: boolean;

  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  applyStreamEvent: (conversationId: string, event: any) => void;
  onMessageComplete: (conversationId: string, messageId: string) => void;
  clearStreaming: (conversationId: string) => void;
  interrupt: (conversationId: string) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  streaming: {},
  loading: false,

  fetchMessages: async (conversationId) => {
    set({ loading: true });
    try {
      const { items } = await api.listMessages(conversationId);
      set(s => ({
        messages: { ...s.messages, [conversationId]: items },
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  sendMessage: async (conversationId, content) => {
    // Optimistic add user message
    const tempMsg = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };

    set(s => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] || []), tempMsg],
      },
      streaming: {
        ...s.streaming,
        [conversationId]: { active: true, text: '', thinking: '', currentTool: null },
      },
    }));

    try {
      const msg = await api.sendMessage(conversationId, content);
      // Replace temp with real message
      set(s => ({
        messages: {
          ...s.messages,
          [conversationId]: s.messages[conversationId].map(m =>
            m.id === tempMsg.id ? msg : m
          ),
        },
      }));
    } catch (err: any) {
      // Remove temp message on error
      set(s => ({
        messages: {
          ...s.messages,
          [conversationId]: s.messages[conversationId].filter(m => m.id !== tempMsg.id),
        },
        streaming: { ...s.streaming, [conversationId]: { active: false, text: '', thinking: '', currentTool: null } },
      }));
    }
  },

  applyStreamEvent: (conversationId, event) => {
    set(s => {
      const current = s.streaming[conversationId] || {
        active: true, text: '', thinking: '', currentTool: null,
      };

      let updated = { ...current, active: true };

      switch (event.type) {
        case 'text_delta':
          updated.text += event.text;
          break;
        case 'thinking_delta':
          updated.thinking += event.text;
          break;
        case 'tool_use_start':
          updated.currentTool = { name: event.toolName, id: event.toolId };
          break;
        case 'tool_use_end':
          updated.currentTool = null;
          break;
        case 'status':
          // Status updates
          break;
      }

      return {
        streaming: { ...s.streaming, [conversationId]: updated },
      };
    });
  },

  onMessageComplete: (conversationId, messageId) => {
    const state = get();
    const streamState = state.streaming[conversationId];

    if (streamState?.text) {
      // Add the assistant message from accumulated stream
      const assistantMsg = {
        id: messageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: streamState.text,
        created_at: new Date().toISOString(),
      };

      set(s => ({
        messages: {
          ...s.messages,
          [conversationId]: [...(s.messages[conversationId] || []), assistantMsg],
        },
        streaming: {
          ...s.streaming,
          [conversationId]: { active: false, text: '', thinking: '', currentTool: null },
        },
      }));
    } else {
      set(s => ({
        streaming: {
          ...s.streaming,
          [conversationId]: { active: false, text: '', thinking: '', currentTool: null },
        },
      }));
    }
  },

  clearStreaming: (conversationId) => {
    set(s => ({
      streaming: {
        ...s.streaming,
        [conversationId]: { active: false, text: '', thinking: '', currentTool: null },
      },
    }));
  },

  interrupt: (conversationId) => {
    wsClient.send({ type: 'interrupt', conversationId });
  },
}));
