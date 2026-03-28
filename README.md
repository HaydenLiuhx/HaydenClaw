# HaydenClaw

Self-hosted AI Agent orchestration platform powered by Claude Code.

## Features

- **Web Interface**: Real-time chat with streaming (thinking, tool calls, text)
- **Feishu Integration**: Bot with streaming card responses
- **Agent Isolation**: Process mode or Docker container mode
- **Workspace Management**: Multiple isolated workspaces
- **Skills Support**: Mount Claude Code skills into agent environment

## Quick Start

```bash
# Clone
git clone https://github.com/HaydenLiuhx/HaydenClaw.git
cd HaydenClaw

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY and JWT_SECRET

# Run
npm run dev:all
```

## Requirements

- Node.js 22+
- Docker (optional, for container mode)

## License

MIT
