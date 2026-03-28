// IPC markers
export const OUTPUT_START_MARKER = '===OUTPUT_START===';
export const OUTPUT_END_MARKER = '===OUTPUT_END===';

// IPC sentinel files
export const SENTINEL_CLOSE = '_close';
export const SENTINEL_DRAIN = '_drain';
export const SENTINEL_INTERRUPT = '_interrupt';

// IPC polling
export const IPC_FALLBACK_POLL_MS = 5000;

// Agent limits
export const DEFAULT_MAX_CONCURRENT_AGENTS = 2;
export const AGENT_MEMORY_LIMIT = '512m';
export const AGENT_CPU_LIMIT = '0.5';

// Feishu
export const FEISHU_CARD_UPDATE_INTERVAL_MS = 500;
export const FEISHU_CARD_MD_LIMIT = 4000;

// Auth
export const JWT_EXPIRY = '30d';
export const BCRYPT_ROUNDS = 10;

// Server
export const DEFAULT_PORT = 3000;
export const DEFAULT_LOG_LEVEL = 'info';

// Pagination
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;
