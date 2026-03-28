import React, { useEffect, useRef, useState } from 'react';
import { useMessageStore } from '../stores/messages.js';
import { useConversationStore } from '../stores/conversations.js';
import { MessageBubble } from './MessageBubble.js';
import { StreamingIndicator } from './StreamingIndicator.js';

export function ChatPanel() {
  const activeId = useConversationStore(s => s.activeId);
  const messages = useMessageStore(s => activeId ? s.messages[activeId] || [] : []);
  const streaming = useMessageStore(s => activeId ? s.streaming[activeId] : null);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const sendMessage = useMessageStore(s => s.sendMessage);
  const interrupt = useMessageStore(s => s.interrupt);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);
    }
  }, [activeId, fetchMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming?.text]);

  const handleSend = async () => {
    if (!input.trim() || !activeId) return;
    const content = input.trim();
    setInput('');
    await sendMessage(activeId, content);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">Select a conversation or create a new one</p>
          <p className="text-sm mt-1">Use the sidebar to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.map(msg => (
            <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {streaming && <StreamingIndicator streaming={streaming} />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            style={{ minHeight: '42px', maxHeight: '200px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />

          {streaming?.active ? (
            <button
              onClick={() => activeId && interrupt(activeId)}
              className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm hover:bg-red-600 transition self-end"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm hover:bg-primary-700 transition disabled:opacity-50 self-end"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
