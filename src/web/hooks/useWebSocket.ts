import { useEffect } from 'react';
import { wsClient } from '../api/ws.js';
import { useMessageStore } from '../stores/messages.js';
import { useConversationStore } from '../stores/conversations.js';

export function useWebSocket() {
  const applyStreamEvent = useMessageStore(s => s.applyStreamEvent);
  const onMessageComplete = useMessageStore(s => s.onMessageComplete);
  const clearStreaming = useMessageStore(s => s.clearStreaming);

  useEffect(() => {
    const unsubStream = wsClient.on('stream', (data: any) => {
      if (data.conversationId && data.event) {
        applyStreamEvent(data.conversationId, data.event);
      }
    });

    const unsubComplete = wsClient.on('message_complete', (data: any) => {
      if (data.conversationId) {
        onMessageComplete(data.conversationId, data.messageId);
      }
    });

    const unsubError = wsClient.on('error', (data: any) => {
      if (data.conversationId) {
        clearStreaming(data.conversationId);
      }
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubError();
    };
  }, [applyStreamEvent, onMessageComplete, clearStreaming]);
}
