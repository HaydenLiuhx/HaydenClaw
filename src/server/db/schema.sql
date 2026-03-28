-- HaydenClaw Database Schema

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    username    TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    description TEXT,
    owner_id    TEXT NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    title       TEXT,
    source      TEXT NOT NULL DEFAULT 'web',
    source_id   TEXT,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    session_id  TEXT,
    status      TEXT NOT NULL DEFAULT 'idle',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source, source_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS memory (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    workspace_id TEXT REFERENCES workspaces(id),
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_workspace_key ON memory(COALESCE(workspace_id, ''), key);
