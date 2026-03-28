import type { ChildProcess } from 'node:child_process';
import type { ContainerOutput } from '../../shared/types.js';

export interface AgentHandle {
  process: ChildProcess;
  conversationId: string;
  workspaceFolder: string;
  onOutput: (output: ContainerOutput) => void;
  onExit: (code: number | null) => void;
  startedAt: number;
}

export type AgentMode = 'process' | 'docker';

export interface AgentSpawnOptions {
  conversationId: string;
  prompt: string;
  sessionId?: string;
  workspaceFolder: string;
  ipcDir: string;
  images?: Array<{ data: string; mimeType?: string }>;
}
