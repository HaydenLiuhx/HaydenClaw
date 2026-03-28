# HaydenClaw

Self-hosted AI Agent orchestration platform. Claude Code accessible via Feishu and Web.

## Tech Stack

- Backend: Node.js + TypeScript + Hono + SQLite (better-sqlite3, WAL mode)
- Frontend: React 19 + Vite 6 + Zustand + Tailwind CSS
- Agent: @anthropic-ai/claude-agent-sdk in child processes or Docker containers
- Feishu: @larksuiteoapi/node-sdk (WebSocket long connection)
- WebSocket: ws library for real-time streaming
- Tests: Vitest (97 tests across 13 files)

## Project Structure

- `src/server/` - Backend (Hono HTTP + WS + Feishu)
  - `routes/` - REST API endpoints (auth, workspaces, conversations, messages, health)
  - `services/` - Business logic (conversation, message, workspace)
  - `agent/` - Agent pipeline (manager, queue, IPC, singleton)
  - `feishu/` - Feishu integration (client, handler, streaming cards)
  - `ws/` - WebSocket server and event broadcasting
  - `db/` - SQLite schema and initialization
  - `middleware/` - JWT auth middleware
- `src/agent/` - Agent runner (runs inside container/process)
  - `runner.ts` - Entry: stdin → Claude SDK → stdout markers
  - `ipc-watcher.ts` - Watches IPC dir for messages/sentinels
- `src/shared/` - Shared types, constants, IPC protocol helpers
- `src/web/` - React frontend
  - `stores/` - Zustand stores (auth, conversations, messages)
  - `components/` - UI components (Sidebar, ChatPanel, MessageBubble, etc.)
  - `api/` - REST client + WebSocket client
- `tests/` - Vitest test suite (97 tests)
- `data/` - Runtime data (gitignored)

## Commands

```bash
npm run dev        # Backend dev server
npm run dev:web    # Frontend dev server
npm run dev:all    # Both
npm run test       # Run all 97 tests
npm run build      # Build for production
npm run start      # Production start
```

## Architecture

- File-based IPC between server and agent (atomic writes, sentinel files)
- Agent output wrapped in `===OUTPUT_START===` / `===OUTPUT_END===` markers
- WebSocket for real-time streaming to web clients
- Feishu streaming cards with 500ms throttled updates
- ConversationQueue manages concurrency (max 2 agents on 2C4G)
- SQLite WAL mode for concurrent read/write

## Database Schema

5 tables: users, workspaces, conversations, messages, memory

## Key Design Decisions

- Process mode by default (no Docker overhead), Docker via AGENT_MODE=docker
- Feishu WebSocket long connection (no public URL needed)
- File-based IPC with atomic rename (proven by HappyClaw)
- Single-user first, multi-user ready (RBAC can be added later)
