import { beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';

// Ensure test data directories exist
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test');

beforeAll(() => {
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'db'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'ipc'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'workspaces'), { recursive: true });
});

afterAll(() => {
  // Clean up test data
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});
