import { create } from 'zustand';
import { api } from '../api/client.js';

interface ConversationState {
  items: any[];
  activeId: string | null;
  activeWorkspaceId: string | null;
  workspaces: any[];
  loading: boolean;

  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<any>;
  setActiveWorkspace: (id: string) => Promise<void>;
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (title?: string) => Promise<any>;
  setActive: (id: string | null) => void;
  removeConversation: (id: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  items: [],
  activeId: null,
  activeWorkspaceId: null,
  workspaces: [],
  loading: false,

  fetchWorkspaces: async () => {
    const { items } = await api.listWorkspaces();
    set({ workspaces: items });

    // Auto-select first workspace if none selected
    if (!get().activeWorkspaceId && items.length > 0) {
      await get().setActiveWorkspace(items[0].id);
    }
  },

  createWorkspace: async (name) => {
    const ws = await api.createWorkspace({ name });
    set(s => ({ workspaces: [ws, ...s.workspaces] }));
    return ws;
  },

  setActiveWorkspace: async (id) => {
    set({ activeWorkspaceId: id, activeId: null });
    await get().fetchConversations(id);
  },

  fetchConversations: async (workspaceId) => {
    set({ loading: true });
    try {
      const { items } = await api.listConversations(workspaceId);
      set({ items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createConversation: async (title) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) throw new Error('No workspace selected');

    const conv = await api.createConversation({ workspaceId: wsId, title });
    set(s => ({ items: [conv, ...s.items], activeId: conv.id }));
    return conv;
  },

  setActive: (id) => set({ activeId: id }),

  removeConversation: async (id) => {
    await api.deleteConversation(id);
    set(s => ({
      items: s.items.filter(c => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  },
}));
