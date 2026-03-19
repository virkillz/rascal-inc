# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Start both server and web in parallel
npm run dev

# Start individually
npm run dev --workspace=packages/server   # tsx watch on port 3000
npm run dev --workspace=packages/web      # Vite on port 5173
```

### Build
```bash
npm run build                                   # Build both packages
npm run build --workspace=packages/server       # tsc → dist/
npm run build --workspace=packages/web          # tsc + vite build
```

There are no test or lint commands configured.

## Architecture

This is a Node.js monorepo (npm workspaces) with two packages:
- `packages/server` — Express + Node.js backend (port 3000)
- `packages/web` — React + Vite frontend (port 5173, proxies `/api` and `/ws` to backend)

### Data Flow

All real-time state changes flow through a single path:
**Backend action → `EventBus.emit()` → WebSocket broadcast → `useAppEvents()` hook → Zustand store update → React re-render**

The `EventBus` (`server/src/event-bus.ts`) is an in-memory pub/sub. Every domain (chat, pipelines, gates, schedules) emits typed `AppEvent` union members. The WebSocket server (`server/src/ws.ts`) subscribes to all events and broadcasts to connected clients. The frontend `useAppEvents()` hook receives them and calls Zustand store methods.

### State Management

**Frontend** (`web/src/store.ts`): Single Zustand `AppState` with domain methods (`loadAgents`, `addTodo`, `updateGate`, etc.). Per-agent state (memory, todos, schedules) is keyed by agent ID and loaded on demand.

**Backend**: No state layer — SQLite is the single source of truth. All routes query via `getDb()` singleton with hand-written SQL (no ORM).

### Key Backend Modules

- `server/src/agent-runner.ts` — Wraps `@mariozechner/pi-coding-agent` SDK. Maintains one persistent `AgentSession` per agent in a `liveSessions` map. System prompt is dynamically assembled from agent config + memory + todos at session start.
- `server/src/pipeline-manager.ts` — Registry of `PipelineRunner` implementations. Templates register their runner here. Handles project lifecycle (start, pause, resume).
- `server/src/human-gate-service.ts` — Emits `gate:created` events when pipelines hit approval checkpoints. Resumes pipeline via `runner.resume()` when user decides.
- `server/src/template-loader.ts` — Reads template manifest JSON + agent system prompts from filesystem, inserts agents with `source='template'` into DB.
- `server/src/scheduler.ts` — Polls `agent_schedules` table, fires synthetic chat messages on cron schedule, emits `schedule:fired`.

### API Structure

REST routers live in `server/src/api/`. Each router is domain-scoped:
- `agents.ts`, `chat.ts`, `memory.ts`, `todos.ts`, `schedules.ts` — Core agent domain
- `templates.ts`, `plugins.ts`, `pipeline.ts`, `gates.ts` — Phase 3 template/pipeline domain
- `settings.ts`, `workspace.ts` — System configuration

Frontend API client (`web/src/api.ts`) uses a generic `req<T>()` fetch helper organized by the same domains.

### Template / Pipeline System

Templates implement the `PipelineRunner` interface and register with `PipelineManager`. The platform handles:
- Project state persistence (`pipeline_projects` table)
- Human gate creation and decision routing
- WebSocket stage/status broadcasts (`pipeline:stage`, `gate:created`)

Templates are responsible for their own agent orchestration logic inside `start()` / `resume()` / `pause()`.

### Database

SQLite with WAL mode (`data/` directory, gitignored). No migrations framework — schema is initialized in `server/src/db.ts` via `CREATE TABLE IF NOT EXISTS`. Foreign keys are enabled.

Key tables: `settings`, `agents`, `chat_messages`, `agent_memory`, `agent_todos`, `agent_schedules`, `templates`, `plugins`, `pipeline_projects`, `human_gates`.
