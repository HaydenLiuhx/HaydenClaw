import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar.js';
import { ChatPanel } from './ChatPanel.js';
import { useConversationStore } from '../stores/conversations.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

export function Layout() {
  const fetchWorkspaces = useConversationStore(s => s.fetchWorkspaces);

  // Connect WebSocket and subscribe to events
  useWebSocket();

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  return (
    <div className="h-screen flex">
      <Sidebar />
      <ChatPanel />
    </div>
  );
}
