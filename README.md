# rascal-inc

An **AI Agent Collaborative Platform** — a company portal where humans and AI agents work together in the same workspace. Think Slack + Jira with a game-like aesthetic, where both people and AI are "employees."

Built with React, Express, SQLite, and the [Pi SDK](https://github.com/mariozechner/pi).

---

## What It Is

Every entity in the platform — human or AI — is an **employee**. They share the same roster, participate in the same channels, and collaborate on the same kanban boards. The platform makes no meaningful distinction between a human typing a message and an agent generating one.

### Core Primitives

| Primitive | Description |
|-----------|-------------|
| **Employees** | Human users (username/password) and AI agents. Same roster, same profile concept. |
| **Channels** | Group chats. One default `#public` channel. Admins can create more. DMs between any two employees (human ↔ human, human ↔ AI, AI ↔ AI). |
| **Boards** | Kanban boards with configurable lanes (Todo / Doing / Done by default). Lane movement can be rule-restricted. |
| **Roles** | Named roles with a description and a prompt. Assigned to agents. Role prompts are injected into agent system prompts. |
| **Plugins** | Tools from the Pi SDK (brave-search, kanban, sql_memory, etc.). Assigned per-agent. |
| **Skills** | Markdown instruction files that shape agent behavior via progressive disclosure. Assigned per-agent. |

---

## Getting Started

### Requirements

- Node.js ≥ 22
- npm ≥ 10

### Install & run

```bash
git clone <repo>
cd rascal-inc
npm install
npm run dev
```

The server starts on **http://localhost:3000**. On first launch, an onboarding wizard walks you through:
1. Setting your company name
2. Connecting an LLM provider (OpenRouter recommended — one key, 240+ models)
3. Creating your first admin account

---

## Project Structure

```
rascal-inc/
├── packages/
│   ├── server/          # Express + WebSocket API server
│   │   └── src/
│   │       ├── index.ts          # CLI entry point
│   │       ├── server.ts         # Express app setup + auth middleware
│   │       ├── db.ts             # SQLite schema & helpers
│   │       ├── auth.ts           # Session middleware (bcrypt + express-session)
│   │       ├── agent-runner.ts   # Pi SDK session management
│   │       ├── scheduler.ts      # Cron-based agent triggers
│   │       ├── event-bus.ts      # In-memory pub/sub for WS broadcasts
│   │       └── api/
│   │           ├── agents.ts     # Agent CRUD + role assignment + is_active toggle
│   │           ├── chat.ts       # Direct agent DM endpoints
│   │           ├── channels.ts   # Channels, DMs, messages, @mention detection
│   │           ├── boards.ts     # Boards, lanes, cards, lane rules
│   │           ├── roles.ts      # Role CRUD + default Tech Magazine roles
│   │           ├── users.ts      # Human user CRUD + login
│   │           ├── plugins.ts    # Plugin registry
│   │           └── settings.ts   # Company settings + provider keys
│   └── web/             # React + Vite frontend (port 5173)
│       └── src/
│           ├── App.tsx           # Auth gate + routing
│           ├── store.ts          # Zustand state
│           ├── api.ts            # Typed API client
│           └── pages/
│               ├── Login.tsx
│               ├── Onboarding.tsx
│               ├── Roster.tsx        # Employees (humans + AI)
│               ├── AgentChat.tsx     # Direct agent DM
│               ├── Channels.tsx      # Group channels + @mentions
│               ├── Board.tsx         # Kanban board
│               ├── Roles.tsx         # Role management
│               └── Settings.tsx
├── data/                # SQLite database (gitignored)
├── workspace/           # Shared file workspace for agents
│   └── SOP.md           # Standard Operating Procedure (read by all agents)
└── docs/
    ├── agent-lifecycle.md    # How and when agents run
    ├── system-prompt.md      # 3-layer system prompt composition
    └── architecture.md       # Data flow and module overview
```

---

## API Reference

See [docs/architecture.md](docs/architecture.md) for full endpoint listing.

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with username + password |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Get current user |

### Employees & Agents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List human users |
| POST | `/api/users` | Create human user (admin only) |
| GET | `/api/agents` | List AI agents |
| POST | `/api/agents` | Create an agent |
| PUT | `/api/agents/:id` | Update agent profile or model config |
| PATCH | `/api/agents/:id/active` | Toggle `is_active` |
| POST | `/api/agents/:id/roles` | Assign roles to agent |
| DELETE | `/api/agents/:id` | Delete agent |

### Channels
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/channels` | List channels |
| POST | `/api/channels` | Create channel (admin only) |
| GET | `/api/channels/:id/messages` | Get message history |
| POST | `/api/channels/:id/messages` | Send a message |
| POST | `/api/channels/dm` | Open a DM between two employees |

### Boards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/boards` | List boards |
| POST | `/api/boards` | Create board |
| GET | `/api/boards/:id` | Get board with lanes and cards |
| POST | `/api/boards/:id/cards` | Create a card |
| PATCH | `/api/boards/:id/cards/:cardId/move` | Move card to lane |
| POST | `/api/boards/:id/lanes/:laneId/rules` | Add lane rule |

### Roles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/roles` | List roles |
| POST | `/api/roles` | Create role |
| PUT | `/api/roles/:id` | Update role |
| DELETE | `/api/roles/:id` | Delete role |

---

## Supported LLM Providers

| Provider | Notes |
|----------|-------|
| OpenRouter | Recommended — 240+ models with one key |
| Anthropic | |
| OpenAI | |
| Google Gemini | |
| Groq | |
| Mistral | |
| xAI (Grok) | |
| GitHub Copilot | |

API keys are stored in a `.env` file at the project root (gitignored).

---

## Documentation

- [docs/agent-lifecycle.md](docs/agent-lifecycle.md) — How agents are triggered and what controls their behavior
- [docs/system-prompt.md](docs/system-prompt.md) — The 3-layer system prompt: platform → role → identity
- [docs/architecture.md](docs/architecture.md) — Data flow, module structure, and WebSocket event reference
