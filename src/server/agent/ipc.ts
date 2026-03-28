import { writeIpcMessage, writeSentinel, getIpcInputDir } from '../../shared/ipc-protocol.js';
import { SENTINEL_CLOSE, SENTINEL_DRAIN, SENTINEL_INTERRUPT } from '../../shared/constants.js';
import type { IpcMessage, ImageAttachment } from '../../shared/types.js';

/**
 * Server-side IPC manager for writing messages and sentinels
 * to agent containers/processes.
 */
export class IpcManager {
  constructor(private ipcBaseDir: string) {}

  /**
   * Get the IPC input directory for a conversation.
   */
  getInputDir(conversationId: string): string {
    return getIpcInputDir(this.ipcBaseDir, conversationId);
  }

  /**
   * Write a follow-up message to an active agent.
   */
  writeMessage(conversationId: string, text: string, images?: ImageAttachment[]): string {
    const inputDir = this.getInputDir(conversationId);
    const message: IpcMessage = { type: 'message', text, images };
    return writeIpcMessage(inputDir, message);
  }

  /**
   * Signal the agent to close immediately.
   */
  writeClose(conversationId: string): void {
    writeSentinel(this.getInputDir(conversationId), SENTINEL_CLOSE);
  }

  /**
   * Signal the agent to finish current work then exit.
   */
  writeDrain(conversationId: string): void {
    writeSentinel(this.getInputDir(conversationId), SENTINEL_DRAIN);
  }

  /**
   * Signal the agent to interrupt current query.
   */
  writeInterrupt(conversationId: string): void {
    writeSentinel(this.getInputDir(conversationId), SENTINEL_INTERRUPT);
  }
}
