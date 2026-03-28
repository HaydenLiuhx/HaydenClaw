import { z } from 'zod';
import { DEFAULT_PORT, DEFAULT_LOG_LEVEL, DEFAULT_MAX_CONCURRENT_AGENTS } from '../shared/constants.js';

const configSchema = z.object({
  port: z.coerce.number().default(DEFAULT_PORT),
  databasePath: z.string().default('./data/db/haydenclaw.db'),
  ipcBaseDir: z.string().default('./data/ipc'),
  workspaceBaseDir: z.string().default('./data/workspaces'),
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  jwtSecret: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  feishuAppId: z.string().optional(),
  feishuAppSecret: z.string().optional(),
  agentMode: z.enum(['process', 'docker']).default('process'),
  maxConcurrentAgents: z.coerce.number().default(DEFAULT_MAX_CONCURRENT_AGENTS),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default(DEFAULT_LOG_LEVEL),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  _config = configSchema.parse({
    port: process.env.PORT,
    databasePath: process.env.DATABASE_PATH,
    ipcBaseDir: process.env.IPC_BASE_DIR,
    workspaceBaseDir: process.env.WORKSPACE_BASE_DIR,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
    agentMode: process.env.AGENT_MODE,
    maxConcurrentAgents: process.env.MAX_CONCURRENT_AGENTS,
    logLevel: process.env.LOG_LEVEL,
  });

  return _config;
}

/**
 * Create a config from explicit values (useful for testing).
 */
export function createConfig(overrides: Partial<Config> & Pick<Config, 'anthropicApiKey' | 'jwtSecret'>): Config {
  _config = configSchema.parse(overrides);
  return _config;
}

/**
 * Reset cached config (for testing).
 */
export function resetConfig(): void {
  _config = null;
}
