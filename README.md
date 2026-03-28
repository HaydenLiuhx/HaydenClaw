# HaydenClaw

自托管 AI Agent 编排平台，基于 Claude Code 驱动，支持 Web 和飞书双端访问。

> 灵感来自 [HappyClaw](https://github.com/riba2534/happyclaw)，专为小团队（4人）设计，可在单台服务器（2C4G）上运行。

---

## 功能特性

- **Web 聊天界面** - 实时流式输出，展示思考过程、工具调用和文本响应
- **飞书机器人** - WebSocket 长连接流式卡片响应（无需公网 URL）
- **双模式 Agent** - 进程模式（简单、低开销）或 Docker 容器模式（隔离、安全）
- **工作区管理** - 每个用户可创建多个隔离工作区，各有独立文件系统
- **会话持久化** - Claude SDK 会话跨对话保持上下文
- **并发控制** - 基于队列的执行管理，可配置并发数（默认：2）
- **Claude Max 支持** - 支持 Claude Max 订阅（OAuth）或 API Key（按量付费）

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           客户端层                                   │
│                                                                     │
│   ┌──────────────┐                        ┌──────────────────┐     │
│   │  Web 客户端   │                        │  飞书客户端       │     │
│   │  React 19     │                        │  @larksuiteoapi  │     │
│   │  + Zustand    │                        │  WSClient        │     │
│   └──────┬───────┘                        └────────┬─────────┘     │
│          │ WebSocket + REST                        │ WebSocket      │
└──────────┼─────────────────────────────────────────┼───────────────┘
           │                                         │
┌──────────┼─────────────────────────────────────────┼───────────────┐
│          ▼               服务端层                    ▼               │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐     │
│   │  Hono HTTP   │  │  WS Server   │  │  飞书事件分发器      │     │
│   │  REST API    │  │  (ws 库)     │  │  消息处理器          │     │
│   └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘     │
│          │                 │                      │                 │
│          └────────────┬────┘──────────────────────┘                │
│                       ▼                                            │
│              ┌─────────────────┐                                   │
│              │ ConversationQueue│                                   │
│              │ (会话级队列       │                                  │
│              │  + 并发控制)     │                                   │
│              └────────┬────────┘                                   │
│                       ▼                                            │
│              ┌─────────────────┐     ┌──────────────────┐         │
│              │  AgentManager    │────▶│  SQLite (WAL)    │         │
│              │  进程生命周期管理 │     │  5 张表           │         │
│              └────────┬────────┘     └──────────────────┘         │
└───────────────────────┼────────────────────────────────────────────┘
                        │
┌───────────────────────┼────────────────────────────────────────────┐
│                       ▼          Agent 层                          │
│   ┌──────────────────────────────────────────────┐                │
│   │           Agent 进程 / Docker 容器            │                │
│   │                                                │                │
│   │   stdin ──▶ runner.ts ──▶ Claude Agent SDK    │                │
│   │                              │                 │                │
│   │                              ▼                 │                │
│   │                  ┌──────────────────┐          │                │
│   │                  │ 流式事件:         │          │                │
│   │                  │ - text_delta     │          │                │
│   │                  │ - thinking_delta │          │                │
│   │                  │ - tool_use_start │          │                │
│   │                  │ - tool_use_end   │          │                │
│   │                  │ - tool_progress  │          │                │
│   │                  └────────┬─────────┘          │                │
│   │                           │                    │                │
│   │   stdout ◀── OUTPUT 标记 ◀─────────────────────┘                │
│   │                                                                │
│   │   IPC 目录 ◀── fs.watch ◀── 哨兵文件                           │
│   │   (_close, _drain, _interrupt)                                 │
│   └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### 消息处理流程：从用户发送到响应

```
用户发送消息
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  REST POST   │     │ WS "message" │     │ 飞书 im.message  │
│  /messages   │     │              │     │ receive_v1       │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       └────────────────────┼──────────────────────┘
                            ▼
                  ┌──────────────────┐
                  │ 写入消息到数据库   │ ──▶ SQLite (messages 表)
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ ConversationQueue│
                  │ enqueue() 入队   │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        Agent 运行中?  有空闲槽位?  排队等待?
              │            │            │
              │ 是: IPC    │ 是: 启动   │ 否: 等待
              │ 注入消息   │ 新 Agent   │ 排队
              ▼            ▼            ▼
                  ┌──────────────────┐
                  │ Agent 通过 SDK   │
                  │ 处理 prompt      │
                  └────────┬─────────┘
                           │
                    stdout OUTPUT 标记
                           │
                           ▼
                  ┌──────────────────┐
                  │ parseOutputBuffer│
                  │ 解析输出缓冲区   │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
    ┌──────────────────┐     ┌──────────────────┐
    │ WebSocket         │     │ 飞书卡片          │
    │ 广播流式事件       │     │ 500ms 节流更新    │
    └──────────────────┘     └──────────────────┘
```

### IPC 通信协议

```
/data/ipc/{conversationId}/
└── input/
    ├── {timestamp}-{rand}.json    # 消息载荷
    ├── _close                      # 立即终止 Agent
    ├── _drain                      # 完成当前任务后退出
    └── _interrupt                  # 中断当前查询

Agent stdout 协议:
  ===OUTPUT_START===
  {"status":"stream","result":null,"streamEvent":{"type":"text_delta","text":"你好"}}
  ===OUTPUT_END===
```

### 数据库 ER 图

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│   users      │       │   workspaces      │       │   memory      │
│   用户表     │       │   工作区表         │       │   记忆表      │
├─────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)      │◀──┐   │ id (PK)           │◀──┐   │ id (PK)       │
│ username     │   │   │ name              │   │   │ workspace_id  │──▶ workspaces
│ password_hash│   │   │ path              │   │   │ key           │
│ display_name │   │   │ description       │   │   │ value         │
│ created_at   │   │   │ owner_id (FK)     │───┘   │ created_at    │
│ updated_at   │   │   │ created_at        │       │ updated_at    │
└─────────────┘   │   │ updated_at        │       └──────────────┘
                   │   └──────────────────┘
                   │              ▲
                   │              │
                   │   ┌──────────────────┐       ┌──────────────┐
                   │   │  conversations    │       │   messages    │
                   │   │  会话表           │       │   消息表      │
                   │   ├──────────────────┤       ├──────────────┤
                   │   │ id (PK)           │◀──────│ id (PK)       │
                   └───│ user_id (FK)      │       │ conversation_id│
                       │ workspace_id (FK) │───┘   │ role          │
                       │ title             │       │ content       │
                       │ source (web/feishu)│      │ metadata      │
                       │ source_id         │       │ created_at    │
                       │ session_id        │       └──────────────┘
                       │ status            │       (ON DELETE CASCADE)
                       │ created_at        │
                       │ updated_at        │
                       └──────────────────┘
```

### WebSocket 事件

| 方向 | 事件 | 载荷 |
|------|------|------|
| 客户端 → 服务端 | `message` | `{conversationId, content, images?}` |
| 客户端 → 服务端 | `interrupt` | `{conversationId}` |
| 客户端 → 服务端 | `drain` | `{conversationId}` |
| 客户端 → 服务端 | `close` | `{conversationId}` |
| 客户端 → 服务端 | `ping` | - |
| 服务端 → 客户端 | `stream` | `{conversationId, event: StreamEvent}` |
| 服务端 → 客户端 | `message_complete` | `{conversationId, messageId}` |
| 服务端 → 客户端 | `error` | `{conversationId, error}` |
| 服务端 → 客户端 | `pong` | - |

**StreamEvent 类型**: `text_delta`（文本增量）、`thinking_delta`（思考增量）、`tool_use_start`（工具开始）、`tool_use_end`（工具结束）、`tool_progress`（工具进度）、`status`（状态）、`usage`（用量）

---

## 项目结构

```
HaydenClaw/
├── package.json              # 依赖与脚本
├── tsconfig.json             # TypeScript 配置（共享）
├── tsconfig.node.json        # TypeScript 配置（服务端构建）
├── vitest.config.ts          # 测试配置
├── docker-compose.yml        # Docker 部署
├── Dockerfile                # 服务端 + Web 构建
├── Dockerfile.agent          # Agent 容器（含工具链）
├── .env.example              # 环境变量模板
├── CLAUDE.md                 # AI 助手上下文
│
├── src/
│   ├── server/               # ---- 后端 (Hono) ----
│   │   ├── index.ts          # 入口：启动 Server + WS + 飞书
│   │   ├── config.ts         # Zod 校验环境配置
│   │   ├── logger.ts         # Pino 日志
│   │   ├── middleware/
│   │   │   └── auth.ts       # JWT Bearer Token 认证
│   │   ├── db/
│   │   │   ├── index.ts      # SQLite 初始化（WAL 模式）
│   │   │   └── schema.sql    # 5 张表 DDL
│   │   ├── routes/
│   │   │   ├── auth.ts       # POST /setup, /login, GET /me, /status
│   │   │   ├── workspaces.ts # 工作区 CRUD /api/workspaces
│   │   │   ├── conversations.ts # 会话 CRUD /api/conversations
│   │   │   ├── messages.ts   # 消息 GET + POST /api/.../messages
│   │   │   └── health.ts     # 健康检查 GET /api/health
│   │   ├── services/
│   │   │   ├── workspace.ts  # 工作区业务逻辑
│   │   │   ├── conversation.ts # 会话业务逻辑 + findBySource
│   │   │   └── message.ts    # 消息业务逻辑
│   │   ├── agent/
│   │   │   ├── manager.ts    # Agent 进程/Docker 生命周期管理
│   │   │   ├── queue.ts      # 会话级队列 + 并发控制
│   │   │   ├── ipc.ts        # 文件 IPC 写入工具
│   │   │   ├── singleton.ts  # 共享实例初始化
│   │   │   └── types.ts      # AgentHandle, AgentSpawnOptions
│   │   ├── ws/
│   │   │   ├── index.ts      # WebSocket 服务（认证 + 广播）
│   │   │   └── types.ts      # WS 连接类型
│   │   └── feishu/
│   │       ├── index.ts      # 飞书 WSClient 连接
│   │       ├── handler.ts    # 消息分发 + 卡片生命周期
│   │       ├── cards.ts      # 流式卡片构建器（节流）
│   │       └── types.ts      # 飞书相关类型
│   │
│   ├── agent/                # ---- Agent 运行器 ----
│   │   ├── runner.ts         # stdin → Claude SDK → stdout 标记
│   │   └── ipc-watcher.ts    # fs.watch + 轮询监听 IPC 文件
│   │
│   ├── shared/               # ---- 共享代码 ----
│   │   ├── types.ts          # 所有 TypeScript 接口定义
│   │   ├── constants.ts      # 标记、限制、默认值
│   │   └── ipc-protocol.ts   # IPC 读写工具函数
│   │
│   └── web/                  # ---- 前端 (React) ----
│       ├── index.html
│       ├── main.tsx / App.tsx
│       ├── vite.config.ts
│       ├── api/
│       │   ├── client.ts     # REST API 客户端（fetch 封装）
│       │   └── ws.ts         # WebSocket 客户端（自动重连）
│       ├── stores/
│       │   ├── auth.ts       # 登录/注册/登出状态
│       │   ├── conversations.ts # 工作区 + 会话管理
│       │   └── messages.ts   # 消息 + 流式状态
│       ├── hooks/
│       │   └── useWebSocket.ts # WS 事件 → 消息 store
│       ├── components/
│       │   ├── Layout.tsx    # 整体布局
│       │   ├── Sidebar.tsx   # 工作区选择器 + 会话列表
│       │   ├── ChatPanel.tsx # 消息列表 + 输入框
│       │   ├── MessageBubble.tsx # Markdown + 代码块渲染
│       │   └── StreamingIndicator.tsx # 思考/工具/输入动画
│       └── pages/
│           └── LoginPage.tsx # 登录 + 首次设置页面
│
├── tests/                    # ---- 测试套件（97 个测试） ----
│   ├── setup.ts              # 测试初始化
│   ├── server/
│   │   ├── db.test.ts                    # 7 个测试
│   │   ├── routes/
│   │   │   ├── auth.test.ts              # 12 个测试
│   │   │   ├── workspaces.test.ts        # 7 个测试
│   │   │   └── conversations.test.ts     # 12 + 12 个测试（含消息）
│   │   ├── agent/
│   │   │   ├── manager.test.ts           # 5 个测试
│   │   │   ├── ipc-manager.test.ts       # 6 个测试
│   │   │   └── queue.test.ts             # 3 个测试
│   │   ├── ws/
│   │   │   └── handlers.test.ts          # 4 个测试
│   │   └── feishu/
│   │       ├── cards.test.ts             # 12 个测试
│   │       └── handler.test.ts           # 5 个测试
│   ├── agent/
│   │   └── ipc-watcher.test.ts           # 8 个测试
│   ├── shared/
│   │   └── ipc-protocol.test.ts          # 14 个测试
│   └── e2e/
│       └── conversation-flow.test.ts     # 2 个测试
│
├── data/                     # 运行时数据（已 gitignore）
│   ├── db/                   # SQLite 数据库
│   ├── ipc/                  # 每个会话的 IPC 文件
│   └── workspaces/           # 用户工作区文件
│
└── scripts/                  # 工具脚本
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 22+ |
| 语言 | TypeScript | ^5.7 |
| 后端框架 | Hono + @hono/node-server | ^4.11 |
| 数据库 | SQLite（WAL 模式）via better-sqlite3 | ^11.8 |
| 前端 | React + Vite + Zustand | 19 / 6 / 5 |
| 样式 | Tailwind CSS | ^3.4 |
| Agent SDK | @anthropic-ai/claude-agent-sdk | ^0.2.85 |
| 飞书 | @larksuiteoapi/node-sdk | ^1.60 |
| WebSocket | ws | ^8.19 |
| 校验 | zod | ^3.24 |
| 认证 | jsonwebtoken + bcryptjs | ^9.0 / ^3.0 |
| 日志 | pino + pino-pretty | ^9.6 |
| 测试 | Vitest + @testing-library/react | ^3.0 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight | ^9.0 |

---

## 快速开始

### 前置条件

- Node.js 22+
- npm 10+
- Claude Code CLI 已登录（OAuth 模式）或 Anthropic API Key

### 开发环境搭建

```bash
git clone https://github.com/HaydenLiuhx/HaydenClaw.git
cd HaydenClaw

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env：设置 JWT_SECRET（必填，至少 16 个字符）
# Claude Max 用户：ANTHROPIC_API_KEY 保持默认 'oauth' 即可
# API Key 用户：设置 ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# 启动开发服务（后端 + 前端）
npm run dev:all

# 打开 http://localhost:5173
# 首次访问 → 创建管理员账号
```

### 认证方式

| 方式 | 配置 | 适用场景 |
|------|------|----------|
| **Claude Max（OAuth）** | `ANTHROPIC_API_KEY=oauth` 或留空 | 本地开发、个人使用 |
| **API Key** | `ANTHROPIC_API_KEY=sk-ant-...` | 服务器部署、按量付费 |

OAuth 模式继承本地 `claude login` 会话，无需额外 API 费用。

---

## 部署方案

### 方案一：Docker Compose

```bash
cp .env.example .env
# 编辑 .env 填写配置

docker compose up -d --build

# 访问 http://服务器IP:3000
```

### 方案二：Mac Mini（pm2 守护进程）

```bash
# 在 Mac Mini 上
git clone https://github.com/HaydenLiuhx/HaydenClaw.git
cd HaydenClaw && npm install && npm run build

# 安装 pm2
npm install -g pm2

# 配置环境变量
cp .env.example .env
# 编辑 .env

# 使用 pm2 启动
pm2 start dist/server/index.js --name haydenclaw
pm2 save && pm2 startup
```

### 方案三：外网访问（Cloudflare Tunnel）

```bash
# 在 Mac Mini 上安装 cloudflared
brew install cloudflared
cloudflared tunnel login

# 创建隧道
cloudflared tunnel create haydenclaw
cloudflared tunnel route dns haydenclaw claw.你的域名.com

# 创建配置
cat > ~/.cloudflared/config.yml << EOF
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: claw.你的域名.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# 运行隧道
cloudflared tunnel run haydenclaw
```

### 资源需求

| 配置 | CPU | 内存 | 并发 Agent 数 | 团队规模 |
|------|-----|------|--------------|----------|
| 最低配置 | 2C | 4G | 2 | 4 人 |
| 推荐配置 | 4C | 8G | 5-8 | 5-10 人 |

资源分配方案（2C4G）：

```
┌─────────────────────────────────────────┐
│ 组件             │  CPU  │  内存         │
├─────────────────┼───────┼───────────────┤
│ Hono 服务端     │  0.5  │  512 MB       │
│ Agent #1        │  0.5  │  1 GB         │
│ Agent #2        │  0.5  │  1 GB         │
│ 系统 + 缓冲     │  0.5  │  512 MB       │
├─────────────────┼───────┼───────────────┤
│ 合计            │  2.0  │  3 GB         │
└─────────────────────────────────────────┘
```

---

## 环境变量配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `JWT_SECRET` | 是 | - | JWT 签名密钥（至少 16 个字符） |
| `ANTHROPIC_API_KEY` | 否 | `oauth` | `oauth` 使用 Claude Max，或填 `sk-ant-...` API Key |
| `PORT` | 否 | `3000` | 服务端口 |
| `AGENT_MODE` | 否 | `process` | `process`（进程）或 `docker`（容器） |
| `MAX_CONCURRENT_AGENTS` | 否 | `2` | 最大并发 Agent 数 |
| `ANTHROPIC_MODEL` | 否 | `sonnet` | 默认模型（`sonnet` / `opus` / `haiku`） |
| `FEISHU_APP_ID` | 否 | - | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 否 | - | 飞书应用密钥 |
| `DATABASE_PATH` | 否 | `./data/db/haydenclaw.db` | SQLite 数据库路径 |
| `IPC_BASE_DIR` | 否 | `./data/ipc` | IPC 文件目录 |
| `WORKSPACE_BASE_DIR` | 否 | `./data/workspaces` | 工作区目录 |
| `LOG_LEVEL` | 否 | `info` | 日志级别：`debug` / `info` / `warn` / `error` |

---

## 飞书机器人配置

### 连接流程图

```
┌──────────────────┐     WebSocket      ┌──────────────────┐
│  飞书服务器       │◀──────────────────▶│  HaydenClaw      │
│  (开放平台)       │   长连接           │  飞书模块         │
└──────────────────┘                    └──────────────────┘
        │                                         │
        │  im.message.receive_v1                  │
        ▼                                         ▼
  用户在飞书群/私聊               handleMessage()
  中发送消息                ┌──▶ 查找/创建会话
        │                  │    发送初始卡片
        │                  │    加入 Agent 队列
        ▼                  │         │
  检测到 @机器人 ──────────┘         ▼
                                Agent 处理 prompt
                                      │
                                500ms 节流更新卡片
                                (思考 → 工具 → 响应)
                                      │
                                      ▼
                                最终卡片展示完整响应
```

### 配置步骤

1. 在[飞书开放平台](https://open.feishu.cn/)创建自建应用
2. 开启 **机器人** 能力
3. 添加权限：`im:message`、`im:message.group_at_msg`、`im:chat`
4. 订阅事件：`im.message.receive_v1`
5. 在 `.env` 中设置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
6. 重启服务 - 自动通过 WebSocket 连接（无需公网 URL）

### 飞书卡片特性

- 彩色标题头：青色（运行中）、绿色（完成）、红色（错误）
- 思考区：展示 Claude 推理过程（最多 300 字）
- 工具调用区：显示正在运行/已完成的工具
- 响应文本：最多 4000 字（飞书限制）
- 500ms 节流更新，避免触发飞书频率限制

---

## 开发指南

### 常用命令

```bash
npm run dev          # 后端开发服务（端口 3000，tsx watch 热重载）
npm run dev:web      # 前端开发服务（端口 5173，Vite HMR）
npm run dev:all      # 同时启动前后端
npm run build        # 构建服务端 (tsc) + 前端 (vite)
npm run start        # 生产模式启动 (node)
npm run test         # 运行全部 97 个测试
npm run test:watch   # Vitest 监听模式
npm run test:coverage # 覆盖率报告
npm run typecheck    # TypeScript 类型检查（双配置）
```

### 测试套件概览

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| `server/db.test.ts` | 7 | SQLite 初始化、WAL 模式、表操作、CRUD |
| `server/routes/auth.test.ts` | 12 | 初始化设置、登录、JWT 验证、用户信息 |
| `server/routes/workspaces.test.ts` | 7 | 工作区 CRUD、权限、校验 |
| `server/routes/conversations.test.ts` | 24 | 会话 + 消息 CRUD |
| `shared/ipc-protocol.test.ts` | 14 | 原子写入、解析、哨兵文件 |
| `agent/ipc-watcher.test.ts` | 8 | fs.watch、轮询、哨兵检测 |
| `server/agent/manager.test.ts` | 5 | 进程启动、终止、并发限制 |
| `server/agent/ipc-manager.test.ts` | 6 | IPC 文件操作 |
| `server/agent/queue.test.ts` | 3 | 队列入队、Agent 生命周期 |
| `server/ws/handlers.test.ts` | 4 | WS 认证、订阅、广播 |
| `server/feishu/cards.test.ts` | 12 | 卡片构建、更新、节流 |
| `server/feishu/handler.test.ts` | 5 | 消息分发、会话映射 |
| `e2e/conversation-flow.test.ts` | 2 | 完整消息 → Agent → 响应流程 |
| **合计** | **97** | |

### 核心设计决策

1. **默认进程模式** - 无 Docker-in-Docker 开销，内存更低，调试更简单。通过 `AGENT_MODE=docker` 切换容器模式。
2. **文件 IPC** - 经 HappyClaw 验证可靠。原子 rename 防止部分读取，哨兵文件控制生命周期。
3. **SQLite WAL 模式** - 小团队单写者足够，零运维开销。
4. **飞书 WebSocket** - 无需公网 URL 或 Webhook 回调地址，SDK 自动处理重连。
5. **500ms 卡片节流** - 避免飞书频率限制，同时保持响应流畅。
6. **OAuth 优先** - Claude Max 订阅用户无需额外 API 费用，API Key 为可选项。

---

## API 接口参考

### 认证

| 方法 | 路径 | 需认证 | 说明 |
|------|------|--------|------|
| GET | `/api/auth/status` | 否 | 检查是否需要初始化设置 |
| POST | `/api/auth/setup` | 否 | 创建首个管理员用户 |
| POST | `/api/auth/login` | 否 | 登录，返回 JWT |
| GET | `/api/auth/me` | 是 | 获取当前用户信息 |

### 工作区

| 方法 | 路径 | 需认证 | 说明 |
|------|------|--------|------|
| GET | `/api/workspaces` | 是 | 获取用户工作区列表 |
| POST | `/api/workspaces` | 是 | 创建工作区 |
| PUT | `/api/workspaces/:id` | 是 | 更新工作区 |
| DELETE | `/api/workspaces/:id` | 是 | 删除工作区 |

### 会话

| 方法 | 路径 | 需认证 | 说明 |
|------|------|--------|------|
| GET | `/api/workspaces/:wid/conversations` | 是 | 获取会话列表 |
| POST | `/api/workspaces/:wid/conversations` | 是 | 创建会话 |
| DELETE | `/api/conversations/:id` | 是 | 删除会话 |

### 消息

| 方法 | 路径 | 需认证 | 说明 |
|------|------|--------|------|
| GET | `/api/conversations/:id/messages` | 是 | 获取消息列表 |
| POST | `/api/conversations/:id/messages` | 是 | 发送消息（触发 Agent 执行） |

### 健康检查

| 方法 | 路径 | 需认证 | 说明 |
|------|------|--------|------|
| GET | `/api/health` | 否 | 服务健康检查 |

---

## Git 提交历史

| 提交 | 阶段 | 说明 |
|------|------|------|
| `424cf20` | 阶段 1 | 项目骨架、数据库、REST API 和测试 |
| `e6082b3` | 阶段 2 | Agent 运行器、IPC 通信、会话队列 |
| `88f43ec` | 阶段 3 | Web 前端和 WebSocket 客户端事件 |
| `af0cf67` | 阶段 4 | 飞书集成与流式卡片 |
| `2f52155` | 阶段 5 | Docker 部署、端到端测试和文档 |
| `8f8a7c8` | 附加 | 支持 Claude Max 订阅（OAuth 模式） |

---

## TODO 待办事项

### 高优先级

- [ ] **Web 端图片支持** - 在聊天中上传图片（后端已支持 `images` 字段）
- [ ] **会话标题自动生成** - 使用首条消息或 Claude 摘要作为标题
- [ ] **错误恢复机制** - 自动重试失败的 Agent 启动，改进 UI 错误提示
- [ ] **Agent 超时控制** - 超过可配置时间自动终止 Agent
- [ ] **移动端适配** - 优化 Web UI 在手机飞书/浏览器上的显示

### 多用户与安全

- [ ] **RBAC 权限控制** - 管理员、成员、访客角色
- [ ] **工作区共享** - 团队成员间共享工作区
- [ ] **邀请机制** - 生成邀请链接，供新成员加入
- [ ] **请求限流** - 按用户限制请求频率，防止滥用
- [ ] **审计日志** - 记录谁在何时做了什么操作

### Agent 增强

- [ ] **MCP Server 管理** - 按工作区配置和管理 MCP 服务
- [ ] **自定义技能** - 将 Claude Code Skills 目录挂载到 Agent
- [ ] **Agent 预设模板** - 为常见任务预配置 system prompt
- [ ] **文件上传** - 通过 Web/飞书上传文件到工作区
- [ ] **Git 集成** - 在会话中展示 git status/diff，支持自动提交
- [ ] **多模型切换** - 按会话切换 Claude 模型（sonnet/opus/haiku）

### 飞书增强

- [ ] **富媒体消息** - 处理飞书的文件/图片/视频消息
- [ ] **群聊绑定工作区** - 自动将飞书群与工作区关联
- [ ] **飞书卡片交互** - 添加交互按钮（中断、重试、切换工作区）
- [ ] **话题回复** - 在飞书话题中回复，保持对话有序

### 基础设施

- [ ] **计费系统** - 按用户统计 Token 使用量，设置配额
- [ ] **监控仪表盘** - Agent 状态、队列深度、Token 用量图表
- [ ] **备份与恢复** - 自动将 SQLite 备份到 S3/R2
- [ ] **水平扩展** - 基于 Redis 的队列，支持多服务器部署
- [ ] **HTTPS 支持** - 内置 TLS 或反向代理指南
- [ ] **健康检查 UI** - 管理页面展示系统运行状态

### 开发体验

- [ ] **OpenAPI 文档** - 自动生成 API 文档
- [ ] **扩展 E2E 测试** - 基于 Playwright 的浏览器端到端测试
- [ ] **CI/CD 流水线** - GitHub Actions 自动测试、构建、部署
- [ ] **贡献指南** - 如何添加新功能、代码风格规范
- [ ] **Storybook** - 组件视觉测试

---

## 开源协议

MIT
