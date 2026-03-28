import { AgentManager } from './manager.js';
import { IpcManager } from './ipc.js';
import { ConversationQueue } from './queue.js';
import type { Config } from '../config.js';

let _agentManager: AgentManager | null = null;
let _ipcManager: IpcManager | null = null;
let _conversationQueue: ConversationQueue | null = null;

/**
 * Initialize the agent pipeline (manager + IPC + queue).
 */
export function initAgentPipeline(config: Config): {
  agentManager: AgentManager;
  ipcManager: IpcManager;
  conversationQueue: ConversationQueue;
} {
  _agentManager = new AgentManager(
    config.maxConcurrentAgents,
    config.agentMode,
    config.anthropicApiKey
  );

  _ipcManager = new IpcManager(config.ipcBaseDir);

  _conversationQueue = new ConversationQueue(
    _agentManager,
    _ipcManager,
    config.ipcBaseDir,
    config.workspaceBaseDir
  );

  return {
    agentManager: _agentManager,
    ipcManager: _ipcManager,
    conversationQueue: _conversationQueue,
  };
}

export function getAgentManager(): AgentManager | null {
  return _agentManager;
}

export function getIpcManager(): IpcManager | null {
  return _ipcManager;
}

export function getConversationQueue(): ConversationQueue | null {
  return _conversationQueue;
}
