import { query } from '@anthropic-ai/claude-agent-sdk';
import { IpcWatcher } from './ipc-watcher.js';
import { wrapOutput } from '../shared/ipc-protocol.js';
import type { ContainerInput, ContainerOutput, StreamEvent } from '../shared/types.js';

/**
 * Emit a ContainerOutput to stdout wrapped in markers.
 */
function emit(output: ContainerOutput): void {
  process.stdout.write(wrapOutput(output));
}

/**
 * Emit a stream event.
 */
function emitStream(event: StreamEvent): void {
  emit({ status: 'stream', result: null, streamEvent: event });
}

/**
 * Read all of stdin as a string.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

/**
 * Create an async iterable message stream that allows injecting follow-up messages.
 * This is used as the `prompt` parameter for the SDK's query() function.
 */
class MessageStream {
  private queue: Array<{ role: 'user'; content: string | Array<{ type: string; text?: string; source?: any }> }> = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string, images?: Array<{ data: string; mimeType?: string }>): void {
    const content: any[] = [];

    if (text) {
      content.push({ type: 'text', text });
    }

    if (images) {
      for (const img of images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/png',
            data: img.data,
          },
        });
      }
    }

    this.queue.push({
      role: 'user',
      content: content.length === 1 && content[0].type === 'text' ? text : content,
    });

    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      while (this.queue.length > 0) {
        const msg = this.queue.shift()!;
        yield {
          type: 'user' as const,
          message: msg,
          parent_tool_use_id: null,
          session_id: '',
        };
      }
      if (this.done) return;
      await new Promise<void>((r) => { this.waiting = r; });
      this.waiting = null;
    }
  }
}

/**
 * Process a single message from the SDK query iterator.
 */
function processMessage(message: any): void {
  if (message.type === 'stream_event') {
    const event = message.event;

    if (event?.type === 'content_block_start') {
      const block = event.content_block;
      if (block?.type === 'tool_use') {
        emitStream({
          type: 'tool_use_start',
          toolName: block.name || 'unknown',
          toolId: block.id || '',
        });
      } else if (block?.type === 'thinking') {
        // Thinking block start - deltas will follow
      }
    } else if (event?.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        emitStream({ type: 'text_delta', text: delta.text });
      } else if (delta?.type === 'thinking_delta' && delta.text) {
        emitStream({ type: 'thinking_delta', text: delta.text });
      }
    }
  } else if (message.type === 'tool_progress') {
    // Tool execution progress
    emitStream({
      type: 'tool_progress',
      toolId: message.tool_use_id || '',
      progress: message.content || '',
    });
  } else if (message.type === 'system') {
    if (message.subtype === 'init' && message.session_id) {
      // Capture session ID
      emit({
        status: 'stream',
        result: null,
        newSessionId: message.session_id,
      });
    }
  } else if (message.type === 'result') {
    // Final result
    emit({
      status: message.subtype === 'success' ? 'success' : 'error',
      result: message.result || null,
      streamEvent: message.usage ? {
        type: 'usage',
        inputTokens: message.usage.input_tokens || 0,
        outputTokens: message.usage.output_tokens || 0,
      } : undefined,
    });
  }
}

/**
 * Main agent runner entry point.
 */
async function main(): Promise<void> {
  // Read ContainerInput from stdin
  const inputData = await readStdin();
  if (!inputData) {
    emit({ status: 'error', result: 'No input provided' });
    process.exit(1);
  }

  let input: ContainerInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    emit({ status: 'error', result: 'Invalid JSON input' });
    process.exit(1);
  }

  // Setup IPC watcher for follow-up messages
  const ipcInputDir = `${input.ipcDir}/input`;
  const watcher = new IpcWatcher(ipcInputDir);
  const messageStream = new MessageStream();

  // Push initial prompt
  messageStream.push(input.prompt, input.images);

  // Wire IPC messages to the message stream
  watcher.on('message', (msg) => {
    messageStream.push(msg.text, msg.images);
  });

  let queryHandle: any = null;

  watcher.on('interrupt', () => {
    if (queryHandle?.interrupt) {
      queryHandle.interrupt();
    }
  });

  watcher.on('close', () => {
    watcher.stop();
    messageStream.end();
    process.exit(0);
  });

  watcher.on('drain', () => {
    // Don't inject more messages; let current query finish
    messageStream.end();
  });

  try {
    // Run Claude Agent SDK query
    const workDir = input.workspaceFolder || process.cwd();

    queryHandle = query({
      prompt: messageStream,
      options: {
        model: process.env.ANTHROPIC_MODEL || 'sonnet',
        cwd: workDir,
        ...(input.sessionId ? { resume: input.sessionId } : {}),
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: '',
        },
        thinking: { type: 'adaptive' },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
      },
    } as any);

    // Process stream events
    for await (const message of queryHandle) {
      processMessage(message);
    }
  } catch (err: any) {
    emit({
      status: 'error',
      result: err.message || 'Agent execution failed',
    });
  } finally {
    watcher.stop();
  }
}

main().catch((err) => {
  emit({ status: 'error', result: err?.message || 'Unexpected error' });
  process.exit(1);
});
