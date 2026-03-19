# rascal-inc

A platform for running virtual AI-agent companies. Create a team of AI employees, chat with them individually, and give each one their own role, system prompt, and LLM model.

Built with React, Express, SQLite, and the [Pi SDK](https://github.com/mariozechner/pi).

---

## Features

- **Company setup** — onboarding wizard to name your company and connect an LLM provider
- **Agent roster** — create employees with names, roles, descriptions, and system prompts
- **Per-agent chat** — talk to any agent directly; full message history persisted to SQLite
- **Provider management** — configure API keys for 8+ LLM providers (OpenRouter, Anthropic, OpenAI, Google, Groq, Mistral, xAI, GitHub Copilot)
- **Default model** — set a company-wide default provider and model, overridable per agent
- **Per-agent model override** — each agent can use a different provider and model
- **Light/dark mode** — toggle in the sidebar, preference persisted to localStorage

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

The server starts on **http://localhost:3000** and the Vite dev server proxies the API automatically.

On first launch, the onboarding wizard walks you through:
1. Setting your company name and mission
2. Connecting an LLM provider (OpenRouter recommended — one key, 240+ models)
3. Choosing how to start (build your team manually)

---

## Project Structure

```
rascal-inc/
├── packages/
│   ├── server/          # Express + WebSocket API server
│   │   └── src/
│   │       ├── index.ts          # CLI entry point
│   │       ├── server.ts         # Express app setup
│   │       ├── db.ts             # SQLite schema & helpers
│   │       ├── agent-runner.ts   # Pi SDK session management
│   │       └── api/
│   │           ├── agents.ts     # Agent CRUD endpoints
│   │           ├── chat.ts       # Chat endpoints
│   │           └── settings.ts   # Settings & provider endpoints
│   └── web/             # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx
│           ├── store.ts          # Zustand state
│           ├── api.ts            # API client
│           ├── contexts/
│           │   └── ThemeContext.tsx
│           ├── components/
│           │   └── Layout.tsx    # Sidebar navigation
│           └── pages/
│               ├── Onboarding.tsx
│               ├── Roster.tsx
│               ├── AgentChat.tsx
│               └── Settings.tsx
├── data/                # SQLite database (gitignored, created at runtime)
└── PLAN.md              # Full platform architecture & roadmap
```

---

## API Endpoints

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get company settings & default model |
| POST | `/api/settings` | Update company name, mission, or default model |
| GET | `/api/settings/providers` | List all providers with configured status |
| POST | `/api/settings/providers/:id` | Save API key for a provider |
| DELETE | `/api/settings/providers/:id` | Remove API key for a provider |

### Agents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create an agent |
| GET | `/api/agents/:id` | Get agent details |
| PUT | `/api/agents/:id` | Update agent profile or model config |
| DELETE | `/api/agents/:id` | Delete a user-created agent |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/:id/chat` | Get chat history |
| POST | `/api/agents/:id/chat` | Send a message, get a reply |
| DELETE | `/api/agents/:id/chat` | Clear history and reset session |

---

## Supported Providers

| Provider | Env variable | Notes |
|----------|-------------|-------|
| OpenRouter | `OPENROUTER_API_KEY` | Recommended — 240+ models |
| Anthropic | `ANTHROPIC_API_KEY` | |
| OpenAI | `OPENAI_API_KEY` | |
| Google Gemini | `GEMINI_API_KEY` | |
| Groq | `GROQ_API_KEY` | |
| Mistral | `MISTRAL_API_KEY` | |
| xAI (Grok) | `XAI_API_KEY` | |
| GitHub Copilot | `GH_TOKEN` | |

API keys are stored in a `.env` file in the project root (gitignored).

---

## Roadmap

See [PLAN.md](PLAN.md) for the full platform architecture.

- **Phase 1** (current) — company setup, agent roster, per-agent chat, provider management
- **Phase 2** — agent memory, todo list, scheduler, shared workspace
- **Phase 3** — template system, plugin manager, pipeline runner, human gates
- **Phase 4** — notification center, skill assignment UI, `rascal` CLI binary
