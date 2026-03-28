# HaydenClaw

Self-hosted AI Agent orchestration platform. Claude Code accessible via Feishu and Web.

## Tech Stack

- Backend: Node.js + TypeScript + Hono + SQLite (better-sqlite3, WAL mode)
- Frontend: React 19 + Vite 6 + Zustand + Tailwind CSS
- Agent: @anthropic-ai/claude-agent-sdk in child processes or Docker containers
- Feishu: @larksuiteoapi/node-sdk (WebSocket long connection)
- WebSocket: ws library for real-time streaming
- Tests: Vitest

## Project Structure

- `src/server/` - Backend (Hono HTTP + WS + Feishu)
- `src/agent/` - Agent runner (runs inside container/process)
- `src/shared/` - Shared types and constants
- `src/web/` - React frontend
- `tests/` - Vitest test suite
- `data/` - Runtime data (gitignored)
- `skills/` - Claude Code skills (mounted into agent)

## Commands

```bash
npm run dev        # Backend dev server
npm run dev:web    # Frontend dev server
npm run dev:all    # Both
npm run test       # Run tests
npm run build      # Build all
npm run start      # Production start
```

## Architecture

- File-based IPC between server and agent (atomic writes, sentinel files)
- Agent output wrapped in `===OUTPUT_START===` / `===OUTPUT_END===` markers
- WebSocket for real-time streaming to web clients
- Feishu streaming cards with 500ms throttled updates
- Max 2 concurrent agents on 2C4G server
