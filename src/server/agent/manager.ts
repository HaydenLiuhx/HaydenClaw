import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { parseOutputBuffer } from '../../shared/ipc-protocol.js';
import { getLogger } from '../logger.js';
import type { ContainerInput, ContainerOutput } from '../../shared/types.js';
import type { AgentHandle, AgentMode, AgentSpawnOptions } from './types.js';

export class AgentManager {
  private agents = new Map<string, AgentHandle>();
  private activeCount = 0;
  private logger = getLogger();

  constructor(
    private maxConcurrent: number,
    private agentMode: AgentMode,
    private anthropicApiKey: string,
    private agentScriptPath?: string
  ) {}

  get availableSlots(): number {
    return this.maxConcurrent - this.activeCount;
  }

  get runningCount(): number {
    return this.activeCount;
  }

  isRunning(conversationId: string): boolean {
    return this.agents.has(conversationId);
  }

  /**
   * Spawn an agent process for a conversation.
   */
  async spawnAgent(
    options: AgentSpawnOptions,
    onOutput: (output: ContainerOutput) => void,
    onExit: (code: number | null) => void
  ): Promise<void> {
    if (this.activeCount >= this.maxConcurrent) {
      throw new Error(`No available agent slots (${this.activeCount}/${this.maxConcurrent})`);
    }

    if (this.agents.has(options.conversationId)) {
      throw new Error(`Agent already running for conversation ${options.conversationId}`);
    }

    // Ensure IPC directory exists
    const ipcInputDir = path.join(options.ipcDir, 'input');
    fs.mkdirSync(ipcInputDir, { recursive: true });

    // Ensure workspace directory exists
    fs.mkdirSync(options.workspaceFolder, { recursive: true });

    const input: ContainerInput = {
      prompt: options.prompt,
      sessionId: options.sessionId,
      workspaceFolder: options.workspaceFolder,
      chatId: options.conversationId,
      ipcDir: options.ipcDir,
      images: options.images,
    };

    const proc = this.agentMode === 'docker'
      ? this.spawnDocker(input, options)
      : this.spawnProcess(input, options);

    this.activeCount++;
    const handle: AgentHandle = {
      process: proc,
      conversationId: options.conversationId,
      workspaceFolder: options.workspaceFolder,
      onOutput,
      onExit,
      startedAt: Date.now(),
    };
    this.agents.set(options.conversationId, handle);

    this.pipeOutput(proc, handle);

    proc.on('exit', (code) => {
      this.logger.info(
        { conversationId: options.conversationId, code, duration: Date.now() - handle.startedAt },
        'Agent process exited'
      );
      this.agents.delete(options.conversationId);
      this.activeCount--;
      onExit(code);
    });

    proc.on('error', (err) => {
      this.logger.error({ conversationId: options.conversationId, err }, 'Agent process error');
      this.agents.delete(options.conversationId);
      this.activeCount--;
      onExit(1);
    });

    // Write input to stdin
    proc.stdin!.write(JSON.stringify(input));
    proc.stdin!.end();

    this.logger.info(
      { conversationId: options.conversationId, mode: this.agentMode },
      'Agent spawned'
    );
  }

  private spawnProcess(input: ContainerInput, options: AgentSpawnOptions): ChildProcess {
    // Default to the runner script in our project
    const scriptPath = this.agentScriptPath || path.resolve('src/agent/runner.ts');
    const runner = scriptPath.endsWith('.ts') ? 'tsx' : 'node';

    return spawn(runner, [scriptPath], {
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: this.anthropicApiKey,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'sonnet',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.workspaceFolder,
    });
  }

  private spawnDocker(input: ContainerInput, options: AgentSpawnOptions): ChildProcess {
    const containerName = `haydenclaw-agent-${options.conversationId.slice(0, 8)}`;
    const image = process.env.AGENT_DOCKER_IMAGE || 'haydenclaw-agent:latest';

    return spawn('docker', [
      'run', '--rm', '-i',
      '--name', containerName,
      '--cpus=0.5', '--memory=1g',
      '-v', `${options.ipcDir}:${options.ipcDir}`,
      '-v', `${options.workspaceFolder}:/workspace`,
      '-e', `ANTHROPIC_API_KEY=${this.anthropicApiKey}`,
      '-e', `ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL || 'sonnet'}`,
      image,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
  }

  private pipeOutput(proc: ChildProcess, handle: AgentHandle): void {
    let buffer = '';

    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const { outputs, remaining } = parseOutputBuffer(buffer);
      buffer = remaining;

      for (const output of outputs) {
        try {
          handle.onOutput(output);
        } catch (err) {
          this.logger.error({ err }, 'Error in output handler');
        }
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // Log stderr but don't treat it as agent output
      this.logger.debug({ conversationId: handle.conversationId, stderr: text }, 'Agent stderr');
    });
  }

  /**
   * Kill an agent process.
   */
  kill(conversationId: string): boolean {
    const handle = this.agents.get(conversationId);
    if (!handle) return false;

    handle.process.kill('SIGTERM');
    // Force kill after 5 seconds
    setTimeout(() => {
      if (this.agents.has(conversationId)) {
        handle.process.kill('SIGKILL');
      }
    }, 5000);

    return true;
  }

  /**
   * Kill all running agents.
   */
  killAll(): void {
    for (const [id] of this.agents) {
      this.kill(id);
    }
  }
}
