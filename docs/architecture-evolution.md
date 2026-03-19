# Architecture Evolution Plan

## Core Thesis

The framework/template boundary needs a sharper cut. Using the **company/worker analogy**:

| Layer | Responsibility | Who builds it |
|-------|---------------|---------------|
| **Framework** (rascal-inc) | Agent runtime, event bus, pipeline orchestration, platform tools, plugin loader | Platform engineers |
| **Plugin** | External capability — provides tools and optional setup (API services, rendering engines) | Plugin authors |
| **Template** | Who the agents are, what they know, how they work together | Domain experts |

A template should contain **no code** that belongs to the platform. It is a pure knowledge + process package:
- **Roster** — agent identities, roles, system prompts
- **Skills** — domain knowledge documents
- **SOPs** — Standard Operating Procedures (pipeline logic)
- **Schemas** — the shape of data flowing through the pipeline

Anything that provides tools or requires installation is a **plugin**, not a template concern.

---

## What's Wrong Today

### Problem 1: Remotion lives inside the template

`the_render_rascals/remotion-engine/` is a full Node project managed by the template. But Remotion is a **rendering capability** — infrastructure, not business logic. The template shouldn't own it.

### Problem 2: Plugins are slots, not implementations

`packages/server/src/api/plugins.ts` defines 7 plugin IDs with hardcoded metadata and API-key management. There are no actual tool implementations — plugins are just database rows. When an agent declares `"tools": ["elevenlabs-tts"]`, nothing happens.

### Problem 3: No physical plugin home

There is no `plugins/` folder in `rascal-inc`. Plugin code has nowhere to live. Compare with `~/Projects/fabiana/plugins/` — each plugin is a self-contained directory with `index.ts` + `plugin.json`. The pattern is clear and proven.

### Problem 4: Templates can define domain tools

`TEMPLATE_SKILL.md` documents a `tools/` folder inside templates. This mixes platform concerns into templates. Domain tools belong in plugins.

---

## Phase A — Plugin Folder + Rich Plugin Interface

**Goal:** Give plugins a physical home and a contract that covers both API-key services and installable engines (like Remotion).

### A1. Create `packages/server/src/plugins/` directory

Mirror the fabiana pattern. Each plugin is a subdirectory:

```
packages/server/src/plugins/
├── elevenlabs/
│   ├── plugin.json       # metadata, env vars, tool IDs exported
│   └── index.ts          # implements RascalPlugin interface
├── gemini-image/
│   ├── plugin.json
│   └── index.ts
├── youtube/
│   ├── plugin.json
│   └── index.ts
├── remotion/             # ← new (moved from the_render_rascals)
│   ├── plugin.json
│   └── index.ts
└── ...
```

### A2. Define the `RascalPlugin` interface

```ts
// packages/server/src/plugins/types.ts

export interface PluginConfig {
  id: string
  displayName: string
  description: string
  /** Environment variables this plugin needs */
  env: Array<{
    key: string
    required: boolean
    description: string
  }>
  /** Tool IDs this plugin exports (used in agent config.json) */
  toolIds: string[]
}

export interface RascalPlugin {
  config: PluginConfig

  /**
   * One-time setup — called once when the plugin is first configured.
   * Use for npm installs, project scaffolding, etc.
   * Optional — API-key-only plugins don't need this.
   */
  setup?(workspaceDir: string): Promise<void>

  /**
   * Return tool instances scoped to the given context.
   * Called each time an agent session is created.
   */
  getTools(ctx: ToolContext): ToolDefinition[]

  /**
   * Optional health check — shown in the Plugin Manager UI.
   */
  healthCheck?(): Promise<{ ok: boolean; message?: string }>
}
```

### A3. `plugin.json` format (matches fabiana)

```jsonc
{
  "id": "elevenlabs",
  "displayName": "ElevenLabs",
  "description": "Text-to-speech audio generation",
  "env": [
    { "key": "ELEVENLABS_API_KEY", "required": true, "description": "API key from elevenlabs.io" }
  ],
  "toolIds": ["elevenlabs_tts"]
}
```

### A4. Plugin loader (`packages/server/src/plugin-loader.ts`)

Replace the hardcoded `BUILT_IN_PLUGINS` array in `api/plugins.ts` with a filesystem scanner:

```ts
export class PluginLoader {
  /** Scan plugins/ dir, import each index.ts, validate RascalPlugin shape */
  async loadAll(): Promise<Map<string, RascalPlugin>>

  /** Return all ToolDefinitions for a given agent context */
  getToolsForAgent(toolIds: string[], ctx: ToolContext): ToolDefinition[]
}
```

`buildAgentTools()` in `platform-tools.ts` calls `pluginLoader.getToolsForAgent()` for any tool ID it doesn't recognise as a platform tool. This keeps platform tools and plugin tools distinct without a single giant switch statement.

### A5. Implement the first-wave plugins

Priority order based on existing template needs:

| Plugin | Type | Tools exported |
|--------|------|----------------|
| `elevenlabs` | API key | `elevenlabs_tts` |
| `gemini-image` | API key | `gemini_generate_image` |
| `youtube` | API key | `youtube_upload`, `youtube_search` |
| `remotion` | Installable engine | `remotion_render`, `remotion_preview` |

---

## Phase B — Remotion Becomes a Plugin

**Goal:** The `remotion` plugin owns all Remotion infrastructure. Templates declare it as a dependency and use its tools.

### B1. `plugins/remotion/plugin.json`

```jsonc
{
  "id": "remotion",
  "displayName": "Remotion",
  "description": "Video rendering engine — compiles React compositions to MP4",
  "env": [],
  "toolIds": ["remotion_render", "remotion_preview", "remotion_studio_url"]
}
```

No API key needed — Remotion runs locally.

### B2. `plugins/remotion/index.ts`

```ts
export const remotionPlugin: RascalPlugin = {
  config: { ... },

  async setup(workspaceDir) {
    // 1. Create remotion-engine/ inside the workspace if not present
    // 2. Run `npm install` for remotion deps
    // 3. Scaffold Root.tsx + shared components if new project
  },

  getTools(ctx) {
    return [
      makeRemotionRenderTool(ctx.workspaceDir),
      makeRemotionPreviewTool(ctx.workspaceDir),
    ]
  }
}

// Tool: renders a Remotion composition to an output file
function makeRemotionRenderTool(workspaceDir: string): ToolDefinition { ... }
// Tool: returns the Remotion Studio URL (launches Studio if not running)
function makeRemotionPreviewTool(workspaceDir: string): ToolDefinition { ... }
```

### B3. Migrate `the_render_rascals`

- Remove `remotion-engine/` from `the_render_rascals`
- Add `"requiredPlugins": ["remotion"]` to its `template.json`
- The template's agents declare `"tools": ["remotion_render"]` in their config
- The `remotion_plan.md` content becomes the plugin's `skill.md` (injected into any agent that uses the plugin)

---

## Phase C — Template Simplification

**Goal:** Templates become pure knowledge + process packages. No code that belongs to the platform.

### C1. Remove `tools/` from template structure

The `tools/` directory documented in `TEMPLATE_SKILL.md` is removed. Domain-specific tools that a template needs but don't fit an existing plugin become their own plugin (or get added to an existing plugin).

### C2. Add `schemas/` to template structure

Templates declare the shape of their pipeline data:

```
my-template/
├── schemas/
│   ├── project-brief.ts    # TypeScript interface exported as default
│   └── scene-manifest.ts
```

`template.json` references them:
```jsonc
"schemas": {
  "projectBrief": "schemas/project-brief.ts",
  "sceneManifest": "schemas/scene-manifest.ts"
}
```

The platform injects the schema source (or a human-readable summary) into the relevant agent's system prompt so agents know the exact shape of data they produce and consume. At human gate transitions, the platform can validate the artifact against the schema.

### C3. Rename `skills/` → `sops/` distinction (additive)

`skills/` remain — they are domain knowledge docs ("here's how YouTube SEO works").

`sops/` is a new optional directory for procedural playbooks:

```markdown
# Video Production SOP

When a new project arrives:
1. Director agent reads the brief and fills out project-brief.json
2. Research agent finds 5 reference videos using `youtube_search`
3. Director creates a human gate for brief approval
4. On approval, Writer agent produces the scene manifest
5. Renderer agent calls `remotion_render` for each scene
```

SOPs are injected into the pipeline controller agent's system prompt. They don't replace the PipelineRunner code but complement it — the code enforces order, the SOP gives the agent context for *why*.

### C4. Updated `TEMPLATE_SKILL.md`

Update the authoring guide to reflect:
- No `tools/` directory
- New `schemas/` directory
- New `sops/` directory
- Plugin declaration is the only way to get external capabilities
- Reference the new `RascalPlugin` docs for writing a custom plugin

---

## Phase D — Workspace Serving (Agent-Built Dashboards)

**Goal:** Agents that have coding tools can build React/HTML UIs in their workspace, and those UIs are surfaced in the shell.

### D1. Static file serving route

```ts
// packages/server/src/api/workspace.ts  (extend existing)
router.get('/preview/:templateId/*', (req, res) => {
  const file = path.join(dataDir, 'workspace', req.params.templateId, req.params[0])
  res.sendFile(file)
})
```

### D2. Template panel for workspace preview

Templates can ship a `ui/panels/WorkspacePreview.tsx` that iframes the preview URL:

```tsx
export default function WorkspacePreview() {
  const url = `/api/workspace/preview/${templateId}/dashboard/index.html`
  return <iframe src={url} className="w-full h-full border-0" />
}
```

This requires zero framework changes — the `ui/panels/` slot system already supports this. The iframe pattern means the agent-built UI runs in its own origin.

### D3. Agent permissions

Agents already receive `createCodingTools(workspaceDir)` from the Pi SDK, giving them read/write/bash access inside their workspace. No new permissions needed — just a system prompt that tells the agent where the dashboard goes:

```markdown
## Dashboard
You may build a React or HTML dashboard at `dashboard/` in your workspace.
The platform serves it at /api/workspace/preview/render-rascals/dashboard/.
Run `npx vite build` to compile it when ready.
```

---

## Implementation Order

```
Phase A  →  Phase B  →  Phase C  →  Phase D
(plugin     (Remotion    (template    (workspace
 infra)      as plugin)   cleanup)     serving)
```

Each phase is independently shippable. Phase A is the prerequisite for all others.

### Phase A acceptance criteria
- `packages/server/src/plugins/` exists with at least `elevenlabs/` implemented end-to-end
- `buildAgentTools()` routes unknown tool IDs through `pluginLoader.getToolsForAgent()`
- Plugin Manager UI shows configured/unconfigured status (no UI change needed — existing API still works)
- `BUILT_IN_PLUGINS` hardcoded array in `api/plugins.ts` is replaced by plugin loader scan

### Phase B acceptance criteria
- `remotion-engine/` is gone from `the_render_rascals`
- `remotion` plugin lives in `rascal-inc/packages/server/src/plugins/remotion/`
- `remotion_render` and `remotion_preview` tools work end-to-end
- `the_render_rascals/template.json` declares `"requiredPlugins": ["remotion"]`

### Phase C acceptance criteria
- `TEMPLATE_SKILL.md` updated — no `tools/` section, yes `schemas/` and `sops/` sections
- `the_render_rascals` has no `tools/` directory
- At least one schema declared and injected into an agent system prompt

### Phase D acceptance criteria
- `GET /api/workspace/preview/:templateId/*` serves static files
- One template ships a `WorkspacePreview` panel that renders an iframe
- An agent can build a simple `dashboard/index.html` and have it appear in the UI
