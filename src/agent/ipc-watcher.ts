import { watch, readdirSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { SENTINEL_CLOSE, SENTINEL_DRAIN, SENTINEL_INTERRUPT, IPC_FALLBACK_POLL_MS } from '../shared/constants.js';
import type { IpcMessage } from '../shared/types.js';

export interface IpcWatcherEvents {
  message: (msg: IpcMessage) => void;
  interrupt: () => void;
  drain: () => void;
  close: () => void;
}

/**
 * Watches the IPC input directory for new messages and sentinel files.
 * Used inside the agent process to receive follow-up messages from the server.
 */
export class IpcWatcher extends EventEmitter {
  private processed = new Set<string>();
  private watcher: ReturnType<typeof watch> | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private inputDir: string) {
    super();

    if (!existsSync(inputDir)) {
      mkdirSync(inputDir, { recursive: true });
    }

    // Initial scan for any existing files
    this.scan();

    // Watch for new files
    try {
      this.watcher = watch(inputDir, { persistent: false }, () => {
        if (!this.closed) this.scan();
      });
    } catch {
      // fs.watch may not work in all environments
    }

    // Fallback polling
    this.fallbackTimer = setInterval(() => {
      if (!this.closed) this.scan();
    }, IPC_FALLBACK_POLL_MS);
  }

  private scan(): void {
    if (this.closed) return;

    // Check sentinels first
    if (this.checkAndConsumeSentinel(SENTINEL_CLOSE)) {
      this.emit('close');
      return;
    }
    if (this.checkAndConsumeSentinel(SENTINEL_INTERRUPT)) {
      this.emit('interrupt');
    }
    if (this.checkAndConsumeSentinel(SENTINEL_DRAIN)) {
      this.emit('drain');
    }

    // Process message files
    let files: string[];
    try {
      files = readdirSync(this.inputDir).filter(f => f.endsWith('.json')).sort();
    } catch {
      return;
    }

    for (const file of files) {
      if (this.processed.has(file)) continue;
      this.processed.add(file);

      const filePath = path.join(this.inputDir, file);
      try {
        const content = JSON.parse(readFileSync(filePath, 'utf-8'));
        unlinkSync(filePath); // Consume the file
        if (content.type === 'message' && content.text) {
          this.emit('message', content as IpcMessage);
        }
      } catch {
        // Skip malformed files
        try { unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
  }

  private checkAndConsumeSentinel(sentinel: string): boolean {
    const filepath = path.join(this.inputDir, sentinel);
    try {
      if (existsSync(filepath)) {
        unlinkSync(filepath);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  stop(): void {
    this.closed = true;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}
