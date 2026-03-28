import { create } from 'zustand';
import { api } from '../api/client.js';
import { wsClient } from '../api/ws.js';

interface AuthState {
  token: string | null;
  user: any | null;
  initialized: boolean | null; // null = not checked yet
  loading: boolean;
  error: string | null;

  checkStatus: () => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  initialized: null,
  loading: false,
  error: null,

  checkStatus: async () => {
    try {
      const { initialized } = await api.getStatus();
      set({ initialized });
    } catch {
      set({ initialized: false });
    }
  },

  setup: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.setup({ username, password });
      localStorage.setItem('token', token);
      set({ token, user, initialized: true, loading: false });
      wsClient.connect();
    } catch (err: any) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.login({ username, password });
      localStorage.setItem('token', token);
      set({ token, user, loading: false });
      wsClient.connect();
    } catch (err: any) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    wsClient.disconnect();
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) return false;
    try {
      const user = await api.getMe();
      set({ user });
      wsClient.connect();
      return true;
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null });
      return false;
    }
  },
}));
