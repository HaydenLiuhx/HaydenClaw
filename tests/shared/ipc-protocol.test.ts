import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeIpcMessage,
  writeSentinel,
  checkSentinel,
  drainIpcMessages,
  wrapOutput,
  parseOutputBuffer,
  getIpcInputDir,
} from '../../src/shared/ipc-protocol.js';
import { SENTINEL_CLOSE, SENTINEL_DRAIN, SENTINEL_INTERRUPT } from '../../src/shared/constants.js';
import type { ContainerOutput, IpcMessage } from '../../src/shared/types.js';

describe('IPC Protocol', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haydenclaw-ipc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeIpcMessage', () => {
    it('should write a message file', () => {
      const msg: IpcMessage = { type: 'message', text: 'hello' };
      const filepath = writeIpcMessage(tmpDir, msg);

      expect(fs.existsSync(filepath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      expect(content.type).toBe('message');
      expect(content.text).toBe('hello');
    });

    it('should create directory if not exists', () => {
      const nestedDir = path.join(tmpDir, 'nested', 'dir');
      const msg: IpcMessage = { type: 'message', text: 'test' };
      writeIpcMessage(nestedDir, msg);

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should write files with sorted timestamp names', () => {
      writeIpcMessage(tmpDir, { type: 'message', text: 'first' });
      // Tiny delay to ensure different timestamps
      writeIpcMessage(tmpDir, { type: 'message', text: 'second' });

      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json')).sort();
      expect(files.length).toBe(2);
    });
  });

  describe('writeSentinel / checkSentinel', () => {
    it('should write and check close sentinel', () => {
      writeSentinel(tmpDir, SENTINEL_CLOSE);
      expect(fs.existsSync(path.join(tmpDir, SENTINEL_CLOSE))).toBe(true);

      const found = checkSentinel(tmpDir, SENTINEL_CLOSE);
      expect(found).toBe(true);

      // Should be consumed (deleted)
      expect(fs.existsSync(path.join(tmpDir, SENTINEL_CLOSE))).toBe(false);
    });

    it('should return false for missing sentinel', () => {
      const found = checkSentinel(tmpDir, SENTINEL_DRAIN);
      expect(found).toBe(false);
    });

    it('should handle all sentinel types', () => {
      for (const sentinel of [SENTINEL_CLOSE, SENTINEL_DRAIN, SENTINEL_INTERRUPT]) {
        writeSentinel(tmpDir, sentinel);
        expect(checkSentinel(tmpDir, sentinel)).toBe(true);
      }
    });
  });

  describe('drainIpcMessages', () => {
    it('should read and consume all message files', () => {
      writeIpcMessage(tmpDir, { type: 'message', text: 'msg1' });
      writeIpcMessage(tmpDir, { type: 'message', text: 'msg2' });

      const messages = drainIpcMessages(tmpDir);
      expect(messages).toHaveLength(2);
      const texts = messages.map(m => m.text).sort();
      expect(texts).toEqual(['msg1', 'msg2']);

      // Files should be consumed
      const remaining = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
      expect(remaining).toHaveLength(0);
    });

    it('should return empty array for nonexistent directory', () => {
      const messages = drainIpcMessages('/nonexistent/path');
      expect(messages).toHaveLength(0);
    });

    it('should skip malformed files', () => {
      writeIpcMessage(tmpDir, { type: 'message', text: 'valid' });
      fs.writeFileSync(path.join(tmpDir, '999-bad.json'), 'not json');

      const messages = drainIpcMessages(tmpDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('valid');
    });
  });

  describe('wrapOutput / parseOutputBuffer', () => {
    it('should wrap and parse a single output', () => {
      const output: ContainerOutput = {
        status: 'stream',
        result: null,
        streamEvent: { type: 'text_delta', text: 'hello' },
      };

      const wrapped = wrapOutput(output);
      const { outputs, remaining } = parseOutputBuffer(wrapped);

      expect(outputs).toHaveLength(1);
      expect(outputs[0].status).toBe('stream');
      expect(outputs[0].streamEvent?.type).toBe('text_delta');
      expect(remaining.trim()).toBe('');
    });

    it('should parse multiple outputs from buffer', () => {
      const o1: ContainerOutput = { status: 'stream', result: null, streamEvent: { type: 'text_delta', text: 'a' } };
      const o2: ContainerOutput = { status: 'success', result: 'done' };

      const buffer = wrapOutput(o1) + wrapOutput(o2);
      const { outputs } = parseOutputBuffer(buffer);

      expect(outputs).toHaveLength(2);
      expect(outputs[0].status).toBe('stream');
      expect(outputs[1].status).toBe('success');
    });

    it('should handle incomplete buffer', () => {
      const output: ContainerOutput = { status: 'stream', result: null };
      const wrapped = wrapOutput(output);
      // Truncate the buffer (simulate partial read)
      const partial = wrapped.slice(0, wrapped.length - 10);

      const { outputs, remaining } = parseOutputBuffer(partial);
      expect(outputs).toHaveLength(0);
      expect(remaining.length).toBeGreaterThan(0);
    });

    it('should handle mixed content and markers', () => {
      const output: ContainerOutput = { status: 'stream', result: null };
      const buffer = 'some random text\n' + wrapOutput(output) + 'trailing text';

      const { outputs } = parseOutputBuffer(buffer);
      expect(outputs).toHaveLength(1);
    });
  });

  describe('getIpcInputDir', () => {
    it('should construct correct path', () => {
      const result = getIpcInputDir('/data/ipc', 'conv123');
      expect(result).toBe('/data/ipc/conv123/input');
    });
  });
});
