const BASE_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  getStatus: () => request<{ initialized: boolean }>('/auth/status'),
  setup: (data: { username: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMe: () => request<any>('/auth/me'),

  // Workspaces
  listWorkspaces: () => request<{ items: any[] }>('/workspaces'),
  createWorkspace: (data: { name: string; description?: string }) =>
    request<any>('/workspaces', { method: 'POST', body: JSON.stringify(data) }),
  deleteWorkspace: (id: string) =>
    request<any>(`/workspaces/${id}`, { method: 'DELETE' }),

  // Conversations
  listConversations: (workspaceId: string) =>
    request<{ items: any[]; total: number }>(`/conversations?workspaceId=${workspaceId}`),
  createConversation: (data: { workspaceId: string; title?: string }) =>
    request<any>('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  deleteConversation: (id: string) =>
    request<any>(`/conversations/${id}`, { method: 'DELETE' }),

  // Messages
  listMessages: (conversationId: string) =>
    request<{ items: any[] }>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, content: string) =>
    request<any>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};
