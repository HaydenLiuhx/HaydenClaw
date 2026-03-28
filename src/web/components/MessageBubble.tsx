import React from 'react';

interface Props {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function MessageBubble({ role, content }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="prose prose-sm max-w-none">
          <MarkdownContent content={content} />
        </div>
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown rendering - code blocks and basic formatting
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const [, lang, code] = match;
            return (
              <pre key={i} className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto my-2">
                {lang && <div className="text-xs text-gray-400 mb-1">{lang}</div>}
                <code className="text-sm">{code.trim()}</code>
              </pre>
            );
          }
        }

        // Inline code
        const inlineFormatted = part.split(/(`[^`]+`)/g).map((segment, j) => {
          if (segment.startsWith('`') && segment.endsWith('`')) {
            return (
              <code key={j} className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm">
                {segment.slice(1, -1)}
              </code>
            );
          }
          // Bold
          return segment.split(/(\*\*[^*]+\*\*)/g).map((s, k) => {
            if (s.startsWith('**') && s.endsWith('**')) {
              return <strong key={k}>{s.slice(2, -2)}</strong>;
            }
            return <span key={k} className="whitespace-pre-wrap">{s}</span>;
          });
        });

        return <span key={i}>{inlineFormatted}</span>;
      })}
    </>
  );
}
