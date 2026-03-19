# Refactoring Plan — Rascal Inc Platform Pivot

## Vision

Transform rascal-inc from a template/pipeline framework into an **AI Agent Collaborative Platform** — a company portal that feels like Slack + Jira combined, with a game-like UI aesthetic. Both humans and AI agents are "employees" in the same workspace.

---

## What We're Building

### Core Primitives

1. **Employees** — humans (username/password login) and AI agents (name, role, identity prompt). Same roster, same profile concept.
2. **Channels** — one default `#public` channel (group chat). Platform admin can create more. DMs between any two employees (human ↔ human, human ↔ AI, AI ↔ AI).
3. **Boards** — kanban boards with configurable lanes. Lane movement can be rule-restricted (admin-only, role-only, specific employee-only). Default lanes: Todo, Doing, Done. Agents can interact with the board via the `kanban` tool.
4. **Roles** — named roles with a description and a role prompt. Assigned to agents (one or many). Role prompt is injected into agent system prompt. Ships with Tech Magazine examples (Writer, Editor, Researcher, etc.).

### AI Agent System Prompt — 3-Layer Composition

```
[Platform Prompt]    — injected for all agents; contains {company_name}, {working_directory}
                       references SOP.md for company policy
[Role Prompt]        — from assigned role(s); injected per-agent
[Identity Prompt]    — agent's own system_prompt field
[Memory + Todos]     — injected dynamically at session start
```

Platform prompt template (stored in settings):
```
You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.
```

### AI Agent Lifecycle

| Trigger | Behavior |
|---------|----------|
| DM | Always responds (unless `is_active = false`) |
| Group chat @mention | Reads channel history → responds |
| Group chat (no mention) | Ignored by default |
| Scheduler (cron fires) | Reads group chat history → decides whether to respond + works on todos. If `skip_if_no_todos = true` and todo list is empty → skips entirely |
| `is_active = false` | Agent ignores all triggers (DM, group chat, scheduler) |

### Plugins (Tools) vs Skills

- **Plugins** = Tools implementing `ToolDefinition` from Pi SDK. Interact with external APIs. Installed at platform level, assigned per-agent.
- **Skills** = Markdown instruction files (`SKILL.md`). Shape agent behavior via progressive disclosure. Assigned per-agent.

Default plugins: `brave-search`, `elevenlabs`, `gemini-image`, `youtube`, `remotion`, `sql_memory`, `kanban`

---

## Files to Delete

| File | Reason |
|------|--------|
| `packages/server/src/template-loader.ts` | Templates concept dropped |
| `packages/server/src/pipeline-manager.ts` | Replaced by kanban board |
| `packages/server/src/human-gate-service.ts` | Gates replaced by lane rules |
| `packages/server/src/api/templates.ts` | No template API |
| `packages/server/src/api/pipeline.ts` | No pipeline API |
| `packages/server/src/api/gates.ts` | No gates API |
| `packages/web/src/pages/Templates.tsx` | No templates UI |
| `packages/web/src/pages/Pipeline.tsx` | No pipeline UI |

---

## Database Changes

### New tables

```sql
-- Human users (platform admin and human employees)
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#7c6af7',
  password_hash TEXT NOT NULL,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Roles (assigned to AI agents)
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  prompt      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Boards
CREATE TABLE boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lanes within a board
CREATE TABLE lanes (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- Cards (tasks) on the board
CREATE TABLE cards (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  lane_id     TEXT NOT NULL REFERENCES lanes(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT,           -- agent id or user id
  assignee_type TEXT,         -- 'agent' | 'user'
  created_by  TEXT NOT NULL,
  created_by_type TEXT NOT NULL,  -- 'agent' | 'user'
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lane movement rules (who can move cards INTO this lane)
-- If no rules exist for a lane, anyone can move cards there
CREATE TABLE lane_rules (
  id          TEXT PRIMARY KEY,
  lane_id     TEXT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
  rule_type   TEXT NOT NULL,  -- 'admin_only' | 'role' | 'employee'
  target_id   TEXT            -- role_id or agent/user id (null for admin_only)
);

-- Channels (group chats)
CREATE TABLE channels (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  is_dm      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Channel membership
CREATE TABLE channel_members (
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  member_id    TEXT NOT NULL,
  member_type  TEXT NOT NULL,  -- 'agent' | 'user'
  PRIMARY KEY (channel_id, member_id)
);

-- Messages (group chat and DMs)
CREATE TABLE channel_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id    TEXT NOT NULL,
  sender_type  TEXT NOT NULL,  -- 'agent' | 'user'
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_channel_messages ON channel_messages(channel_id, created_at);
```

### Modified tables

```sql
-- agents: add is_active flag; role relationship via agent_roles junction
ALTER TABLE agents ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- agent_roles junction (allows multiple roles per agent)
CREATE TABLE agent_roles (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role_id  TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, role_id)
);

-- agent_schedules: add skip_if_no_todos flag
ALTER TABLE agent_schedules ADD COLUMN skip_if_no_todos INTEGER NOT NULL DEFAULT 0;
```

### Tables kept as-is

`settings`, `agents` (core columns), `chat_messages` (DM history for direct agent chat — kept for backward compat, will migrate to channel_messages), `agent_memory`, `agent_todos`, `agent_schedules`, `plugins`

### Tables to drop (after removing dependent code)

`templates`, `pipeline_projects`, `human_gates`

---

## Backend Changes

### New files

| File | Purpose |
|------|---------|
| `server/src/auth.ts` | Session middleware; login/logout; `requireAuth` and `requireAdmin` express middleware |
| `server/src/api/users.ts` | CRUD for human users; login endpoint |
| `server/src/api/roles.ts` | CRUD for roles; seed default Tech Magazine roles |
| `server/src/api/boards.ts` | Boards, lanes, cards, lane rules |
| `server/src/api/channels.ts` | Channels, DMs, messages; @mention detection |

### Modified files

| File | Changes |
|------|---------|
| `server/src/db.ts` | Add new tables; add `is_active` + `skip_if_no_todos` migration; seed `#public` channel + default board on first run |
| `server/src/agent-runner.ts` | `buildSystemPrompt` → 3-layer: platform prompt + role prompts + identity prompt + memory/todos |
| `server/src/api/agents.ts` | Add `is_active` toggle endpoint; add role assignment endpoints; remove template-agent guard on delete |
| `server/src/api/settings.ts` | Add `platform_prompt`, `company_description` settings |
| `server/src/scheduler.ts` | Check `is_active`; check `skip_if_no_todos`; pass channel history context when firing |
| `server/src/server.ts` | Mount new routers; remove template/pipeline/gate routers; add auth middleware |
| `server/src/event-bus.ts` | Add new event types: `channel:message`, `board:card_moved`, `employee:status` |
| `server/src/plugins/index.ts` | Register `kanban` plugin |

---

## Frontend Changes

### New pages

| File | Purpose |
|------|---------|
| `web/src/pages/Board.tsx` | Kanban board — drag cards, manage lanes, enforce rules |
| `web/src/pages/Channels.tsx` | Channel list sidebar + message view; @mention support |
| `web/src/pages/DirectMessage.tsx` | 1-on-1 DM view (unified component, reused for human↔human and human↔agent) |
| `web/src/pages/Roles.tsx` | Role management; default role examples; assign roles to agents |
| `web/src/pages/Login.tsx` | Login screen (first gate before main UI) |

### Modified files

| File | Changes |
|------|---------|
| `web/src/App.tsx` | Auth gate; route to Login if no session; add routes for new pages |
| `web/src/components/Layout.tsx` | New nav: Employees, Board, Channels, Workspace, Settings. Remove Templates/Pipeline links |
| `web/src/pages/Roster.tsx` | Show both AI agents and human users under "Employees" |
| `web/src/pages/AgentChat.tsx` | Keep for direct agent DM; unify styling with channel message view |
| `web/src/store.ts` | Add state for channels, boards, users; handle new WS events |
| `web/src/api.ts` | Add API client methods for users, roles, boards, channels |
| `web/src/pages/Settings.tsx` | Add platform prompt editor, company description |

### Deleted pages

`web/src/pages/Templates.tsx`, `web/src/pages/Pipeline.tsx`

---

## Build Sequence

### Step 1 — DB + Auth foundation
- Add all new tables to `db.ts`
- Implement `auth.ts` (bcrypt password hash, cookie session)
- Implement `api/users.ts` (create admin on first run, login)
- Seed `#public` channel and default board (Todo / Doing / Done)

### Step 2 — Roles
- Implement `api/roles.ts`
- Seed default Tech Magazine roles: Writer, Editor, Researcher, Publisher, Art Director
- Add `agent_roles` junction; update `api/agents.ts` to expose role assignment
- Update `buildSystemPrompt` in `agent-runner.ts` for 3-layer composition

### Step 3 — Channels + DM
- Implement `api/channels.ts`
- Add @mention detection: parse `@username` in message content
- Update agent lifecycle: group chat message → check @mention → trigger agent if mentioned
- Update WS to broadcast `channel:message` events

### Step 4 — Board (Kanban)
- Implement `api/boards.ts` (boards, lanes, cards, lane rules)
- Lane rule enforcement on card move
- WS `board:card_moved` events

### Step 5 — Agent lifecycle updates
- `is_active` check in DM, group chat, and scheduler paths
- `skip_if_no_todos` in scheduler
- Scheduler passes recent `#public` channel history to agent context

### Step 6 — Remove dead code
- Delete template/pipeline/gate files
- Remove those routes from `server.ts`
- Remove `Templates.tsx` and `Pipeline.tsx`

### Step 7 — Frontend
- Login page + auth gate in App.tsx
- New Layout nav
- Board page (kanban UI)
- Channels page
- Roles admin page
- Update Roster to show humans + AI together
- Connect all new store state + WS events

---

## Key Design Decisions

1. **`chat_messages` stays** during transition. Direct agent chat (the existing per-agent chat page) still works. Channels are additive. We can migrate later.

2. **Kanban tool for agents** — the `kanban` plugin gives agents the ability to create cards, move cards, and read board state. This is how agents participate in work autonomously.

3. **SOP.md** is a plain file in `workspace/SOP.md`. The platform prompt references it. Agents read it via their workspace tools. No special handling needed — it's just a file.

4. **Auth is simple** — bcrypt + `express-session` + SQLite session store. No JWT, no OAuth. Single-server, local deployment.

5. **`#public` is the only default channel** and cannot be deleted. Admin can create more channels. DMs are auto-created on first message between two employees.

6. **Lane rules are additive allow-lists**. If no rules exist → anyone can move. Once a rule is added → only matching employees/roles can move into that lane. `admin_only` overrides everything.
