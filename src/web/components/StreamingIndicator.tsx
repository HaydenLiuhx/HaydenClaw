import React from 'react';

interface StreamingState {
  active: boolean;
  text: string;
  thinking: string;
  currentTool: { name: string; id: string } | null;
}

interface Props {
  streaming: StreamingState;
}

export function StreamingIndicator({ streaming }: Props) {
  if (!streaming.active) return null;

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        {/* Thinking section */}
        {streaming.thinking && (
          <div className="thinking-block mb-2 text-sm">
            <div className="text-xs text-gray-400 mb-1 font-medium">Thinking...</div>
            <p className="whitespace-pre-wrap">{streaming.thinking.slice(-500)}</p>
          </div>
        )}

        {/* Tool use */}
        {streaming.currentTool && (
          <div className="tool-block mb-2">
            <span className="text-gray-500">Running:</span>{' '}
            <code className="text-sm font-mono text-primary-700">{streaming.currentTool.name}</code>
            <span className="ml-2 inline-block w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
          </div>
        )}

        {/* Accumulated text */}
        {streaming.text && (
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-sm">{streaming.text}</p>
          </div>
        )}

        {/* Typing indicator */}
        {!streaming.text && !streaming.thinking && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
