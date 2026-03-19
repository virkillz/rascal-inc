# rascal-inc — Platform Plan

A framework for running virtual AI-agent companies. rascal-inc provides the runtime, web UI, and management infrastructure. Domain-specific teams (video production, blogging, publishing) are installed as **templates**.

The relationship is: rascal-inc is the framework, templates are TypeScript packages that import from it. A template never runs standalone — rascal-inc runs it.

---

## What rascal-inc Provides

### Platform services (available to all templates)

| Service | Description |
| --- | --- |
| `AgentContext` | Per-agent memory, todo list, scheduler, chat history |
| `WorkspaceAPI` | Read/write the company shared folder |
| `EventBus` | Emit events the UI consumes (status, logs, task updates) |
| `PluginRegistry` | Call installed plugins by name; returns tool definitions |
| `HumanGate` | Surface approval checkpoints in UI and await a human decision |
| `AgentRunner` | Wraps Pi SDK agent instantiation, model selection, tool injection |

### Web UI shell

- Company setup wizard (name, mission, values) on first launch
- Agent roster view — card per agent showing name, role, avatar, live status
- Per-agent profile page — system prompt editor, model selector, active plugins/skills
- Per-agent chat — direct conversation with any agent
- Per-agent scheduler, todo list, and memory viewer
- Shared workspace browser — the company shared folder
- Plugin manager — install, configure, activate/deactivate per template
- Template manager — browse, install, switch templates
- Notification center — human gate prompts surface here

### Plugin registry

Plugins are integrations with external services. They are installed at platform level (one set of credentials) and declared as requirements by templates. A plugin provides:
- Credential configuration (API keys stored securely)
- One or more tool definitions (functions agents can call)
- Optional UI settings panel

Built-in plugin slots: ElevenLabs, Gemini, OpenAI, YouTube, Slack, Notion, GitHub. Third-party plugins can be added as npm packages.

### Skill registry

Skills are instruction documents that shape agent behaviour. Two tiers:

**Platform skills** — generic, reusable across templates. Examples: "write concisely", "use web search effectively", "structure a task into subtasks". Installed at platform level, selectable per-agent in the UI.

**Template skills** — domain-specific, ship with the template package. Examples: Remotion component reference, YouTube SEO guide, screenplay formatting rules. Loaded automatically for agents in that template.

---

## Template Architecture

A template is a TypeScript package with the following structure:

```
template-name/
├── template.json          # manifest — required
├── agents/                # agent definitions
│   ├── <name>.md          # system prompt
│   └── <name>.config.json # model, tools, skill assignments
├── pipeline/              # workflow orchestration
│   └── index.ts           # exports a class implementing PipelineRunner
├── tools/                 # domain-specific tool definitions
│   └── <tool-name>.ts     # exports ToolDefinition (Pi SDK format)
├── skills/                # domain skills (markdown)
│   └── <skill-name>.md
├── ui/                    # custom React panels
│   └── panels/
│       └── <PanelName>.tsx
└── workspace/             # starter structure for shared folder
    └── .gitkeep
```

### template.json

```jsonc
{
  "id": "render-rascals",
  "version": "1.0.0",
  "displayName": "The Render Rascals",
  "description": "YouTube video production team — idea to published video.",
  "requiredPlugins": ["elevenlabs", "gemini-image", "youtube"],
  "optionalPlugins": ["slack"],
  "agents": [
    {
      "id": "rex",
      "name": "Rex",
      "role": "Director",
      "systemPromptFile": "agents/rex.md",
      "configFile": "agents/rex.config.json",
      "isPipelineController": true
    },
    {
      "id": "spark",
      "name": "Spark",
      "role": "Ideator",
      "systemPromptFile": "agents/spark.md",
      "configFile": "agents/spark.config.json"
    }
    // ...rest of agents
  ],
  "pipeline": {
    "type": "staged",           // "staged" | "freeform"
    "entryFile": "pipeline/index.ts"
  },
  "uiPanels": [
    {
      "id": "pipeline-view",
      "displayName": "Pipeline",
      "file": "ui/panels/PipelineView.tsx",
      "slot": "main"           // "main" | "agent-card" | "sidebar"
    },
    {
      "id": "project-detail",
      "displayName": "Project",
      "file": "ui/panels/ProjectDetail.tsx",
      "slot": "main"
    }
  ],
  "workspaceStructure": "workspace/"
}
```

### agent config file

```jsonc
// agents/rex.config.json
{
  "defaultModel": "claude-sonnet-4-6",
  "tools": ["pipeline-control"],   // tool IDs — platform-provided or plugin-provided
  "skills": ["render-rascals/director"]  // template skill paths
}
```

---

## The PipelineRunner Interface

The most important interface in the system. rascal-inc needs enough control over the pipeline to reflect state in the UI, handle human gates, and survive process restarts.

```ts
// rascal-inc SDK — templates implement this
export interface PipelineRunner {
  // Called by rascal-inc to start a new project
  start(projectId: string, input: unknown): Promise<void>

  // Called to resume after a human gate decision
  resume(projectId: string, gateId: string, decision: GateDecision): Promise<void>

  // Called to pause execution (e.g. server shutdown)
  pause(projectId: string): Promise<void>

  // Returns current pipeline state (for UI rendering)
  getState(projectId: string): Promise<PipelineState>
}

export interface GateDecision {
  action: 'approve' | 'revise' | 'reject'
  feedback?: string
}

export interface PipelineState {
  projectId: string
  currentStage: string
  stages: Record<string, StageStatus>
  activeAgentId?: string
  errors: PipelineError[]
  waitingForGate?: { gateId: string; description: string }
}

export type StageStatus = 'pending' | 'in-progress' | 'awaiting-approval' | 'complete' | 'failed' | 'cancelled'
```

The pipeline is responsible for its own persistence — it must be able to reconstruct state from disk so the platform can resume after a restart.

---

## Platform Services SDK

Templates import from `rascal-inc`:

```ts
import {
  definePipeline,
  defineAgent,
  createHumanGate,
  useWorkspace,
  useEventBus,
  usePluginRegistry,
} from 'rascal-inc'
```

### AgentRunner

```ts
const agentRunner = defineAgent({
  agentId: 'spark',
  projectId,
  context,              // injected by platform — memory, todo, chat history
  additionalTools,      // domain-specific tools for this invocation
})

const result = await agentRunner.run(prompt)
```

### EventBus

```ts
const events = useEventBus()

events.emit('agent:status', { agentId: 'rex', status: 'working', task: 'Validating concept...' })
events.emit('pipeline:stage', { projectId, stage: 'script', status: 'in-progress' })
events.emit('log', { agentId: 'forge', message: 'Generated scene-01.mp3 (14.2s)' })
```

The UI subscribes to these events over WebSocket and updates in real time.

### HumanGate

```ts
const gate = createHumanGate({
  id: 'concept-approval',
  projectId,
  description: 'Review and approve the video concept before scripting begins.',
  artifact: conceptJson,           // surfaced in the UI alongside the decision buttons
  options: ['approve', 'revise', 'reject'],
})

const decision = await gate.wait()  // suspends until human acts in the UI
```

### WorkspaceAPI

```ts
const workspace = useWorkspace(projectId)  // scoped to a project, or company-wide

await workspace.write('status.json', stateObject)
const concept = await workspace.read('concept.json')
await workspace.mkdir('assets/audio')
```

---

## Install Flow

```
User opens Template Manager
  └─► Selects a template
        └─► rascal-inc reads template.json
              ├─► Checks requiredPlugins against platform plugin registry
              │     └─► For each missing plugin: show install/configure prompt
              ├─► Registers agents in platform DB
              ├─► Loads template skills into skill registry
              ├─► Mounts UI panels into the shell
              ├─► Scaffolds workspace starter structure
              └─► Template is active
```

Multiple templates can be installed but only one is **active** at a time. Switching templates swaps the agent roster and UI panels but preserves all project data.

**Uninstall** removes the template's agents from the roster and deletes its workspace subdirectory. User-created agents are untouched. An "also delete project data" option is offered but off by default.

---

## Provider & Model Management

rascal-inc delegates all LLM calls to Pi SDK. The platform is responsible for storing credentials and passing the right model config when creating an `AgentRunner`.

### Credential storage

API keys live in a `.env` file in the company directory — never in SQLite. The server loads them at startup via `dotenv`. The web UI writes to this file when the user configures a provider in Settings.

```
my-company/
├── .env          ← API keys (gitignored)
├── rascal.json   ← company config, default model, installed templates
└── data/
```

`.env` example:
```
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
```

### Model config

Three levels of model config, each overriding the previous:

| Level | Where stored | Scope |
| --- | --- | --- |
| Company default | `rascal.json` | Fallback for all agents |
| Template suggestion | `agents/<name>.config.json` | Suggested when template installs; user can override |
| Per-agent override | Agent DB record | Set by user in the agent profile page |

```jsonc
// rascal.json
{
  "company": { "name": "...", "mission": "..." },
  "defaultModel": {
    "provider": "openrouter",
    "modelId": "anthropic/claude-sonnet-4-6",
    "thinkingLevel": "low"
  },
  "activeTemplate": "render-rascals"
}
```

Pi SDK model config shape (passed to `AgentRunner`):
```jsonc
{
  "provider": "anthropic",       // openrouter | anthropic | openai | google | groq | mistral | xai | amazon-bedrock | github-copilot | azure-openai-responses | google-vertex | google-gemini-cli
  "modelId": "claude-sonnet-4-6",
  "thinkingLevel": "low"         // minimal | low | medium | high | xhigh — silently ignored if model doesn't support it
}
```

### Settings → Providers page

Lists all supported providers. For each: an API key input, a "Test" button, and a status badge (configured / not configured). Once a provider has a valid key, its models appear in the model picker on every agent profile page.

**OpenRouter is the recommended default** — one key, 240+ models from every major lab. The onboarding nudges toward OpenRouter first; other providers are available as "advanced" options.

---

## Onboarding — First-Run Experience

No CLI wizard. Everything happens in the web UI. The CLI only starts/stops the server.

### First-run flow (three steps)

```
Step 1 — Your Company
  ┌─────────────────────────────────────────┐
  │  Company name  [________________]       │
  │  Mission       [________________]       │
  │  Logo          [ Upload ] (optional)    │
  └─────────────────────────────────────────┘
  [ Continue ]

Step 2 — Connect a provider
  ┌─────────────────────────────────────────┐
  │  Recommended: OpenRouter                │
  │  One API key gives access to 240+       │
  │  models from every major lab.           │
  │                                         │
  │  OpenRouter API key  [______________]   │
  │                      [ Test & Save ]    │
  │                                         │
  │  ▸ Add a different provider instead     │
  └─────────────────────────────────────────┘
  [ Continue ]  [ Skip — I'll do this later ]

Step 3 — How do you want to start?
  ┌──────────────────────┐  ┌──────────────────────┐
  │  Install a template  │  │   Build your team    │
  │    (coming soon)     │  │      manually        │
  └──────────────────────┘  └──────────────────────┘
```

If Step 2 is skipped, agent cards show a "No provider configured" warning and chat is disabled until a key is added in Settings.

"Build manually" drops the user into an empty roster with an "Add employee" prompt as the primary CTA.

### Company = directory

The server runs from a directory. That directory is the company.

```bash
mkdir my-company && cd my-company
npx rascal-inc init     # creates rascal.json, .env, data/, workspace/
npx rascal-inc start    # starts server, opens browser
```

Multiple companies = multiple directories, each started independently on different ports. No global state.

---

## Agent Types

Two kinds of agent, same underlying type. The distinction is a `source` field:

| | Template agent | User agent |
| --- | --- | --- |
| `source` | `"template:<id>"` | `"user"` |
| Created by | Template install | User via UI |
| Deletable | No (locked to pipeline) | Yes |
| Renameable | Yes | Yes |
| System prompt editable | Yes | Yes |
| Model overridable | Yes | Yes |
| Memory / todo / scheduler | Yes | Yes |
| Workspace access | Yes | Yes |
| Chat | Yes | Yes |

Template agents and user agents coexist on the same roster. Installing a template onto a company that already has user agents adds template agents alongside them — nothing is removed.

If the user creates an agent before installing a template and there is a name collision, the template agent is registered with its own unique ID regardless of display name.

---

## Core Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Agent runtime | Pi SDK (`@mariozechner/pi`) | Used inside templates via rascal-inc SDK |
| Backend | Node.js ≥ 22, TypeScript | Express + WebSocket server |
| Frontend | React + Vite | Shell UI + template panel slots |
| Real-time | WebSocket | EventBus bridge between backend and UI |
| Storage | SQLite | Agent memory, todo, scheduler, chat history, project registry |
| File system | Local FS | Shared workspace, project artifacts, assets |
| Auth | None (v1) | Single-user, local deployment |

---

## Directory Structure

```
rascal-inc/
├── packages/
│   ├── core/              # Platform services SDK (what templates import)
│   │   ├── src/
│   │   │   ├── agent-runner.ts
│   │   │   ├── event-bus.ts
│   │   │   ├── human-gate.ts
│   │   │   ├── workspace.ts
│   │   │   ├── plugin-registry.ts
│   │   │   └── types.ts          # PipelineRunner, GateDecision, etc.
│   │   └── package.json
│   ├── server/            # Express + WebSocket, template loader, plugin manager
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── template-loader.ts
│   │   │   ├── plugin-manager.ts
│   │   │   └── api/
│   │   └── package.json
│   └── web/               # React shell UI
│       ├── src/
│       │   ├── shell/     # Company header, agent roster, nav
│       │   ├── pages/     # Profile, chat, scheduler, todo, memory, workspace
│       │   ├── panels/    # Panel slot system for template UI injection
│       │   └── store/     # WebSocket event → UI state
│       └── package.json
├── templates/             # First-party templates (e.g. render-rascals lives here or as a sibling repo)
├── plugins/               # First-party plugin packages
│   ├── elevenlabs/
│   ├── gemini-image/
│   └── youtube/
├── data/                  # SQLite DB, config
│   └── rascal.db
├── workspace/             # Company shared folder
│   └── <template-projects>/
└── package.json           # Monorepo root (pnpm workspaces)
```

---

## Key Design Decisions

1. **Templates import the platform, not the other way around.** rascal-inc is the host. Templates are guests that use the SDK. This keeps the platform clean of domain logic.

2. **Pipeline state lives on disk.** The pipeline runner owns its state files (e.g. `status.json`). rascal-inc reads state via `getState()` but does not own it. This allows the platform to restart without losing pipeline progress.

3. **EventBus is the only real-time coupling.** The pipeline emits events; the UI subscribes. No direct function calls from platform to template UI. Panels subscribe to the same event stream as the shell.

4. **Plugins own credentials.** API keys are stored and managed by the plugin. Agents call plugins by ID and receive tool definitions — they never handle credentials directly.

5. **One active template, multiple installed.** Keeps the agent roster and UI coherent. Projects created under a template remain associated with it even after switching.

6. **SQLite for structured data, file system for artifacts.** Agent memory, todos, chat history → SQLite. Project artifacts, audio, images, video → file system. This keeps large binaries out of the DB and makes projects portable (copy the folder).

7. **No auth in v1.** Single-user, runs locally. Multi-user and cloud hosting are future concerns.

8. **One company = one directory.** The server runs from a directory. State is local. Multiple companies = multiple directories on different ports. No global registry.

9. **OpenRouter as the default provider.** Lowest friction for new users. One key covers all models. Other providers are available but not the recommended first step.

---

## Build Sequence

Each phase produces something usable before moving to the next. Never build infrastructure that nothing uses yet.

### Phase 1 — Skeleton (company lives, agents chat)

Goal: `rascal start` opens a browser, you can create agents and chat with them.

1. `rascal-inc init` — scaffold company directory (`rascal.json`, `.env`, `data/`, `workspace/`)
2. `rascal-inc start` — start Express + WebSocket server, open browser
3. SQLite schema — `agents` table (id, name, role, system_prompt, model_config, source, created_at)
4. First-run onboarding UI — Step 1 (company name), Step 2 (provider key), Step 3 (manual path only)
5. Provider config — read/write `.env`, test endpoint, model picker populated from configured providers
6. Agent roster page — list agents, add agent form (name, role, system prompt, model)
7. Agent chat — single-turn and multi-turn conversation using Pi SDK `AgentRunner`, chat history stored in SQLite

**End of Phase 1:** You have a running local app. You can set up a provider, create agents, and chat with them.

---

### Phase 2 — Per-agent infrastructure

Goal: each agent feels like a real employee with their own workspace.

1. Agent profile page — edit name, role, system prompt, model; view stats
2. Agent memory — CRUD memory entries, shown in profile and injected into agent context
3. Agent todo list — add/complete/delete todos, visible in profile
4. Agent scheduler — cron-style recurring tasks that trigger an agent run (e.g. "every morning, Spark generates a new concept idea")
5. Shared workspace browser — file tree UI, upload/download, agents can read/write via `WorkspaceAPI`
6. EventBus → WebSocket bridge — agent status events update cards in real time

**End of Phase 2:** Agents have persistent memory, todos, a scheduler, and access to a shared workspace. The roster feels alive.

---

### Phase 3 — Template system

Goal: install a template and have its agents and pipeline appear.

1. `template.json` loader — parse manifest, validate required fields
2. Template install flow — check required plugins, register agents, scaffold workspace subdirectory, mount UI panels
3. Plugin manager — install/configure plugins, store keys in `.env`, expose tool definitions to `AgentRunner`
4. `PipelineRunner` interface — platform can `start()`, `resume()`, `pause()`, `getState()` a pipeline
5. `HumanGate` — suspend pipeline at checkpoints, surface in notification center, resume on decision
6. Template panel slot system — React shell can mount panels from the template package at runtime
7. Template manager UI — list installed templates, install/switch/uninstall

**End of Phase 3:** rascal-inc can host a template. The render-rascals template can be installed and its pipeline run end-to-end.

---

### Phase 4 — Polish & CLI

Goal: the tool feels complete enough for daily use.

1. Notification center — human gate prompts, agent errors, scheduler completions
2. Settings pages — Providers, Plugins, Company profile
3. Agent skill assignment UI — toggle platform skills and view template skills per agent
4. `rascal` CLI binary — `init`, `start`, `stop`, `install <template>`, `plugin add <name>`
5. Template uninstall — remove agents, optionally delete workspace subdirectory
6. Error surfaces — agent failures, pipeline retries, blocked states visible in the UI
