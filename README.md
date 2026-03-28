# HaydenClaw

Self-hosted AI Agent orchestration platform powered by Claude Code. Accessible via Web and Feishu.

## Features

- **Web Chat Interface** - Real-time streaming (thinking, tool calls, text output)
- **Feishu Bot** - Streaming card responses via WebSocket long connection
- **Agent Isolation** - Process mode (simple) or Docker container mode (secure)
- **Workspace Management** - Multiple isolated workspaces per user
- **Session Persistence** - Claude SDK sessions persist across conversations
- **Concurrent Agents** - Queue-based execution with configurable concurrency

## Architecture

```
Web/Feishu → Hono Server → ConversationQueue → AgentManager
                                                    ↓
                                              Agent Process/Docker
                                              └─ Claude Agent SDK
                                                    ↓
                                              stdout (OUTPUT markers)
                                                    ↓
                                           parseOutput → broadcast
                                              ↓              ↓
                                          Feishu Card    WebSocket
```

## Quick Start

```bash
git clone https://github.com/HaydenLiuhx/HaydenClaw.git
cd HaydenClaw

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and JWT_SECRET (required)

# Development
npm run dev:all    # Backend + Frontend

# Open http://localhost:5173 and create your admin account
```

## Docker Deployment

```bash
# Configure
cp .env.example .env
# Edit .env with your credentials

# Build and start
docker compose up -d --build

# Access at http://server-ip:3000
# First visit: create admin account via the setup page
```

### Resource Requirements

| Setup | CPU | RAM | Concurrent Agents | Team Size |
|-------|-----|-----|-------------------|-----------|
| Minimum | 2C | 4G | 2 | 4 people |
| Recommended | 4C | 8G | 5-8 | 5-10 people |

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `JWT_SECRET` | Secret for JWT tokens (min 16 chars) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `FEISHU_APP_ID` | - | Feishu app ID for bot integration |
| `FEISHU_APP_SECRET` | - | Feishu app secret |
| `AGENT_MODE` | `process` | `process` or `docker` |
| `MAX_CONCURRENT_AGENTS` | `2` | Max simultaneous agent executions |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Feishu Setup

1. Create a custom app at [Feishu Open Platform](https://open.feishu.cn/)
2. Enable **Bot** capability
3. Subscribe to event: `im.message.receive_v1`
4. Set `FEISHU_APP_ID` and `FEISHU_APP_SECRET` in `.env`
5. Restart the server - it will connect via WebSocket (no public URL needed)

## Development

```bash
npm run dev        # Backend dev server (port 3000)
npm run dev:web    # Frontend dev server (port 5173)
npm run dev:all    # Both concurrently
npm run test       # Run tests (97 tests)
npm run test:watch # Watch mode
npm run build      # Build for production
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + TypeScript + Hono |
| Database | SQLite (WAL mode, better-sqlite3) |
| Frontend | React 19 + Vite 6 + Zustand + Tailwind CSS |
| Agent | Claude Agent SDK |
| Feishu | @larksuiteoapi/node-sdk (WebSocket) |
| WebSocket | ws library |
| Tests | Vitest (97 tests) |

## License

MIT
