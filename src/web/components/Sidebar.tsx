import React, { useState } from 'react';
import { useConversationStore } from '../stores/conversations.js';

export function Sidebar() {
  const {
    workspaces, activeWorkspaceId, setActiveWorkspace,
    items, activeId, setActive,
    createConversation, createWorkspace,
  } = useConversationStore();

  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  const handleNewChat = async () => {
    try {
      const conv = await createConversation();
      setActive(conv.id);
    } catch { /* ignore */ }
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    try {
      const ws = await createWorkspace(newWsName.trim());
      setActiveWorkspace(ws.id);
      setNewWsName('');
      setShowNewWs(false);
    } catch { /* ignore */ }
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">HaydenClaw</h1>
      </div>

      {/* Workspace selector */}
      <div className="px-3 py-2 border-b border-gray-700">
        <select
          value={activeWorkspaceId || ''}
          onChange={(e) => setActiveWorkspace(e.target.value)}
          className="w-full bg-gray-800 text-sm rounded px-2 py-1.5 border border-gray-600"
        >
          {workspaces.map(ws => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowNewWs(!showNewWs)}
          className="text-xs text-gray-400 hover:text-white mt-1"
        >
          + New Workspace
        </button>
        {showNewWs && (
          <div className="mt-1 flex gap-1">
            <input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
              placeholder="Name"
              className="flex-1 bg-gray-800 text-sm rounded px-2 py-1 border border-gray-600"
            />
            <button onClick={handleCreateWorkspace} className="text-xs bg-primary-600 px-2 rounded">
              OK
            </button>
          </div>
        )}
      </div>

      {/* New chat button */}
      <div className="px-3 py-2">
        <button
          onClick={handleNewChat}
          className="w-full text-left px-3 py-2 rounded-lg border border-gray-600 text-sm hover:bg-gray-800 transition"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3">
        {items.map(conv => (
          <button
            key={conv.id}
            onClick={() => setActive(conv.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition truncate ${
              activeId === conv.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {conv.title || 'New Chat'}
          </button>
        ))}
      </div>
    </div>
  );
}
