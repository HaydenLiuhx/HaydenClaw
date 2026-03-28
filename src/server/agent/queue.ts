import path from 'node:path';
import { EventEmitter } from 'node:events';
import { AgentManager } from './manager.js';
import { IpcManager } from './ipc.js';
import { getLogger } from '../logger.js';
import * as conversationService from '../services/conversation.js';
import * as messageService from '../services/message.js';
import { broadcastStreamEvent, broadcastMessageComplete, broadcastError } from '../ws/index.js';
import type { ContainerOutput, StreamEvent, ImageAttachment } from '../../shared/types.js';

interface QueueItem {
  conversationId: string;
  workspaceId: string;
  workspaceFolder: string;
  content: string;
  sessionId?: string;
  images?: ImageAttachment[];
}

interface ConversationState {
  status: 'idle' | 'active' | 'pending';
  pending: QueueItem[];
  accumulatedText: string;
  newSessionId?: string;
}

/**
 * Manages the conversation -> agent execution pipeline.
 * Handles queuing, concurrency control, and result routing.
 */
export class ConversationQueue extends EventEmitter {
  private states = new Map<string, ConversationState>();
  private logger = getLogger();

  constructor(
    private agentManager: AgentManager,
    private ipcManager: IpcManager,
    private ipcBaseDir: string,
    private workspaceBaseDir: string
  ) {
    super();
  }

  /**
   * Enqueue a message for agent processing.
   * If the agent is already running, injects via IPC.
   * If no agent is running and slots are available, spawns a new one.
   * Otherwise, queues for later.
   */
  async enqueue(item: QueueItem): Promise<void> {
    let state = this.states.get(item.conversationId);
    if (!state) {
      state = { status: 'idle', pending: [], accumulatedText: '' };
      this.states.set(item.conversationId, state);
    }

    if (state.status === 'active') {
      // Agent already running — inject via IPC
      this.ipcManager.writeMessage(item.conversationId, item.content, item.images);
      this.logger.debug({ conversationId: item.conversationId }, 'IPC message injected');
      return;
    }

    if (this.agentManager.availableSlots > 0) {
      // Spawn immediately
      await this.startAgent(item, state);
    } else {
      // Queue for later
      state.status = 'pending';
      state.pending.push(item);
      this.logger.info({ conversationId: item.conversationId }, 'Queued (no available slots)');
    }
  }

  private async startAgent(item: QueueItem, state: ConversationState): Promise<void> {
    state.status = 'active';
    state.accumulatedText = '';
    state.newSessionId = undefined;

    const ipcDir = path.join(this.ipcBaseDir, item.conversationId);

    // Update conversation status
    conversationService.updateConversation(item.conversationId, { status: 'active' });

    try {
      await this.agentManager.spawnAgent(
        {
          conversationId: item.conversationId,
          prompt: item.content,
          sessionId: item.sessionId,
          workspaceFolder: item.workspaceFolder,
          ipcDir,
          images: item.images,
        },
        // onOutput callback
        (output: ContainerOutput) => {
          this.handleAgentOutput(item.conversationId, output, state);
        },
        // onExit callback
        (code: number | null) => {
          this.handleAgentExit(item.conversationId, code, state);
        }
      );
    } catch (err: any) {
      this.logger.error({ err, conversationId: item.conversationId }, 'Failed to spawn agent');
      state.status = 'idle';
      conversationService.updateConversation(item.conversationId, { status: 'error' });
      broadcastError(item.conversationId, err.message || 'Failed to start agent');
    }
  }

  private handleAgentOutput(conversationId: string, output: ContainerOutput, state: ConversationState): void {
    // Capture new session ID
    if (output.newSessionId) {
      state.newSessionId = output.newSessionId;
    }

    // Forward stream events to WebSocket clients
    if (output.streamEvent) {
      broadcastStreamEvent(conversationId, output.streamEvent);

      // Accumulate text for final message storage
      if (output.streamEvent.type === 'text_delta') {
        state.accumulatedText += output.streamEvent.text;
      }
    }

    // Handle final result
    if (output.status === 'success' || output.status === 'error') {
      const finalText = output.result || state.accumulatedText || '';

      if (finalText) {
        // Store assistant message
        const msg = messageService.createMessage(
          conversationId,
          'assistant',
          finalText,
          output.streamEvent?.type === 'usage' ? {
            inputTokens: (output.streamEvent as any).inputTokens,
            outputTokens: (output.streamEvent as any).outputTokens,
          } : undefined
        );
        broadcastMessageComplete(conversationId, msg.id);
      }
    }
  }

  private handleAgentExit(conversationId: string, code: number | null, state: ConversationState): void {
    const isError = code !== null && code !== 0;

    // Update session ID if we got a new one
    if (state.newSessionId) {
      conversationService.updateConversation(conversationId, {
        session_id: state.newSessionId,
        status: isError ? 'error' : 'idle',
      });
    } else {
      conversationService.updateConversation(conversationId, {
        status: isError ? 'error' : 'idle',
      });
    }

    if (isError) {
      broadcastError(conversationId, `Agent exited with code ${code}`);
    }

    state.status = 'idle';
    state.accumulatedText = '';

    // Process next pending item
    this.drainPending();
  }

  /**
   * Process pending items across all conversations.
   */
  private drainPending(): void {
    for (const [conversationId, state] of this.states) {
      if (state.status !== 'idle' || state.pending.length === 0) continue;
      if (this.agentManager.availableSlots <= 0) break;

      const item = state.pending.shift()!;
      this.startAgent(item, state).catch(err => {
        this.logger.error({ err, conversationId }, 'Error draining pending');
      });
    }
  }

  /**
   * Interrupt the running agent for a conversation.
   */
  interrupt(conversationId: string): void {
    if (this.agentManager.isRunning(conversationId)) {
      this.ipcManager.writeInterrupt(conversationId);
    }
  }

  /**
   * Drain: let the agent finish, then stop.
   */
  drain(conversationId: string): void {
    if (this.agentManager.isRunning(conversationId)) {
      this.ipcManager.writeDrain(conversationId);
    }
  }

  /**
   * Close: kill the agent immediately.
   */
  close(conversationId: string): void {
    if (this.agentManager.isRunning(conversationId)) {
      this.ipcManager.writeClose(conversationId);
      this.agentManager.kill(conversationId);
    }
  }
}
