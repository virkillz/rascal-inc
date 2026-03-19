# How to Create a Template for rascal-inc

A **template** is a knowledge + process package that brings a domain-specific agent team and pipeline to the rascal-inc platform. The platform runs the template; the template never runs standalone.

Templates own **who** the agents are, **what they know**, and **how they work together**. All external capabilities (APIs, rendering engines, services) are provided by **plugins** — templates never implement tools.

---

## Quick-start structure

```
my-template/
├── template.json          # Manifest — required
├── agents/
│   ├── alice.md           # Alice's system prompt
│   ├── alice.config.json  # Alice's model + tools + skills
│   ├── bob.md
│   └── bob.config.json
├── pipeline/
│   └── index.ts           # Exports a class implementing PipelineRunner
├── schemas/
│   ├── project-brief.ts   # TypeScript interface for pipeline input data
│   └── scene-manifest.ts  # TypeScript interface for inter-stage data
├── sops/
│   └── production.md      # Standard Operating Procedure — injected into pipeline controller
├── skills/
│   └── domain-guide.md    # Domain knowledge docs injected into agent prompts
├── ui/
│   └── panels/
│       ├── PipelineView.tsx   # Optional custom React panels
│       └── WorkspacePreview.tsx  # Optional iframe into agent-built workspace UI
└── workspace/
    └── .gitkeep           # Starter workspace structure (copied on install)
```

---

## 1. template.json — the manifest

Every template must have a `template.json` at its root.

```jsonc
{
  "id": "my-template",           // unique slug, no spaces
  "version": "1.0.0",
  "displayName": "My Template",
  "description": "One-line description shown in the Template Manager.",

  // Plugins the template needs. rascal-inc checks these on install and warns
  // for any that are not yet configured.
  "requiredPlugins": ["elevenlabs", "remotion"],
  "optionalPlugins": ["youtube"],

  // Agent roster — one entry per agent
  "agents": [
    {
      "id": "alice",               // unique within this template
      "name": "Alice",
      "role": "Director",
      "systemPromptFile": "agents/alice.md",
      "configFile": "agents/alice.config.json",
      "isPipelineController": true  // marks the agent that drives the pipeline
    },
    {
      "id": "bob",
      "name": "Bob",
      "role": "Writer",
      "systemPromptFile": "agents/bob.md",
      "configFile": "agents/bob.config.json"
    }
  ],

  // Pipeline configuration
  "pipeline": {
    "type": "staged",              // "staged" or "freeform"
    "entryFile": "pipeline/index.ts"
  },

  // Data schemas for pipeline stages (injected into relevant agent prompts)
  "schemas": {
    "projectBrief": "schemas/project-brief.ts",
    "sceneManifest": "schemas/scene-manifest.ts"
  },

  // Optional custom React panels injected into the shell UI
  "uiPanels": [
    {
      "id": "pipeline-view",
      "displayName": "Pipeline",
      "file": "ui/panels/PipelineView.tsx",
      "slot": "main"              // "main" | "agent-card" | "sidebar"
    }
  ],

  // Directory to scaffold inside the company's workspace/ folder on install
  "workspaceStructure": "workspace/"
}
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique slug, e.g. `"render-rascals"` |
| `version` | string | Semver string |
| `displayName` | string | Human-readable name |
| `agents` | array | At least one agent definition |

All other fields are optional.

---

## 2. Agent system prompt (`agents/<name>.md`)

Write the agent's system prompt in plain Markdown. Reference the company context, pipeline stage, or tool names.

```markdown
You are Alice, the Director of this production team.

Your job is to:
1. Validate incoming project requests
2. Assign tasks to the team
3. Review and approve deliverables before they ship

You have access to the `pipeline-control` tool to advance or pause the pipeline.
Always think step-by-step before acting.
```

**Tips:**
- Keep it role-focused. The platform injects memory and open todos automatically.
- Name concrete tools the agent should prefer using.
- Include failure-mode instructions ("if you cannot complete a task, emit an error event").

---

## 3. Agent config (`agents/<name>.config.json`)

```jsonc
{
  "defaultModel": "claude-sonnet-4-6",  // suggested model; user can override
  "tools": [
    "pipeline-control",    // platform-provided tool IDs
    "elevenlabs_tts",      // plugin tool ID (from elevenlabs plugin)
    "remotion_render"      // plugin tool ID (from remotion plugin)
  ],
  "skills": [
    "my-template/domain-guide"  // template skill paths (relative to skills/)
  ]
}
```

### Platform-provided tool IDs

| ID | Description |
|---|---|
| `pipeline-control` | Start, pause, advance pipeline stages |
| `workspace-read` | Read files from the shared workspace |
| `workspace-write` | Write files to the shared workspace |
| `human-gate` | Create a human approval checkpoint |

### Plugin tool IDs (built-in plugins)

| Plugin | Tool IDs | Requires |
|---|---|---|
| `elevenlabs` | `elevenlabs_tts` | `ELEVENLABS_API_KEY` |
| `gemini-image` | `gemini_generate_image` | `GEMINI_API_KEY` |
| `youtube` | `youtube_search`, `youtube_upload` | `YOUTUBE_API_KEY`, `YOUTUBE_OAUTH_TOKEN` (upload only) |
| `remotion` | `remotion_render`, `remotion_preview` | None (local) |

Plugin tools become available automatically when the plugin is configured and the agent declares the tool ID in its config.

---

## 4. Schemas (`schemas/<name>.ts`)

Schemas define the data shape of artifacts flowing through your pipeline. They serve two purposes:
1. **Agent context** — the schema source is injected into the relevant agent's system prompt so agents know exactly what shape to produce
2. **Gate validation** — the platform validates artifacts against schemas at human gate transitions

```ts
// schemas/project-brief.ts
export default interface ProjectBrief {
  title: string
  description: string
  targetAudience: string
  keyMessages: string[]
  durationSeconds: number
}
```

Declare schemas in `template.json`:
```jsonc
"schemas": {
  "projectBrief": "schemas/project-brief.ts"
}
```

---

## 5. SOPs — Standard Operating Procedures (`sops/<name>.md`)

SOPs are procedural playbooks injected into the pipeline controller agent's system prompt. They give the agent context for *why* the pipeline is ordered the way it is and what to do at each step.

SOPs complement the `PipelineRunner` code — the code enforces order, the SOP guides agent behaviour within each stage.

```markdown
# Video Production SOP

## When a new project arrives
1. Read the project brief from `project-brief.json` in the workspace
2. Run `youtube_search` to find 5–10 reference videos on the same topic
3. Summarise key patterns from top-performing videos (title style, hook, pacing)
4. Draft the scene manifest and write it to `scene-manifest.json`
5. Create a `human_gate` for brief + manifest review before any media is generated

## During production
- Generate all images before requesting TTS audio — images define the scene timing
- For each scene: generate image → generate audio → note duration → update manifest
- Run `remotion_render` only after all scenes have media

## Quality checklist before final gate
- [ ] All scenes have an image and audio file
- [ ] Total video duration is within ±10% of target
- [ ] No placeholder text remains in the manifest
```

Assign an SOP in `agents/<name>.config.json`:
```jsonc
{
  "skills": ["my-template/production-sop"]
}
```

> **Skills vs SOPs:** Skills are domain knowledge ("here's how YouTube SEO works"). SOPs are procedural playbooks ("here's what to do and in what order"). Both are markdown files injected into the system prompt — the distinction is conceptual, helping template authors think clearly about what they're writing.

---

## 6. Skills (`skills/<name>.md`)

Skills are domain knowledge documents injected into an agent's system prompt.

```markdown
# YouTube SEO Guide

When writing titles and descriptions for YouTube videos, follow these rules:

1. **Title**: 60 characters or fewer. Include the primary keyword in the first 5 words.
2. **Description**: First 2 lines appear in search results — make them count.
3. **Tags**: Use 10–15 tags. Mix broad and specific terms.
```

Assign a skill in `agents/<name>.config.json`:
```jsonc
{
  "skills": ["my-template/youtube-seo"]
}
```

---

## 7. PipelineRunner (`pipeline/index.ts`)

The pipeline runner is the heart of the template. rascal-inc calls `start()`, `pause()`, `resume()`, and `getState()` on it.

```ts
import {
  type PipelineRunner,
  type PipelineState,
  type GateDecision,
} from 'rascal-inc'
import { createHumanGate } from 'rascal-inc'
import { useEventBus } from 'rascal-inc'
import { useWorkspace } from 'rascal-inc'

const states = new Map<string, PipelineState>()

export class MyPipeline implements PipelineRunner {
  async start(projectId: string, input: unknown): Promise<void> {
    const events = useEventBus()
    const workspace = useWorkspace(projectId)

    states.set(projectId, {
      projectId,
      currentStage: 'ideation',
      stages: { ideation: 'in-progress', writing: 'pending', render: 'pending' },
      errors: [],
    })

    events.emit('pipeline:stage', { projectId, stage: 'ideation', status: 'in-progress' })

    await workspace.write('project-brief.json', input)

    const gate = createHumanGate({
      id: 'brief-approval',
      projectId,
      description: 'Approve the creative brief before production begins.',
      artifact: input,
    })
    const decision = await gate.wait()
    if (decision.action === 'reject') return

    // … continue stages …
  }

  async pause(projectId: string): Promise<void> {
    const s = states.get(projectId)
    if (s) s.currentStage = 'paused'
  }

  async resume(projectId: string, gateId: string, decision: GateDecision): Promise<void> {
    // Gate resolution handled by human-gate-service automatically
  }

  async getState(projectId: string): Promise<PipelineState> {
    return states.get(projectId) ?? {
      projectId, currentStage: 'idle', stages: {}, errors: [],
    }
  }
}

export default () => new MyPipeline()
```

---

## 8. Custom UI panels (`ui/panels/<Panel>.tsx`)

Panels are React components rendered in slots defined in `template.json`.

```tsx
// ui/panels/PipelineView.tsx
import { useStore } from 'rascal-inc/ui'

export default function PipelineView() {
  const { projects } = useStore()
  const project = projects[0]
  return (
    <div className="p-4">
      {project
        ? Object.entries(project.state.stages).map(([stage, status]) => (
            <div key={stage}>{stage}: {status}</div>
          ))
        : <p>No active project.</p>
      }
    </div>
  )
}
```

### WorkspacePreview panel

Agents with coding tools can build HTML/React apps inside their workspace. Use a `WorkspacePreview` panel to surface that UI in the shell:

```tsx
// ui/panels/WorkspacePreview.tsx
export default function WorkspacePreview() {
  // /api/workspace/preview/:templateId/* serves static files from workspace/<templateId>/
  return (
    <iframe
      src="/api/workspace/preview/my-template/dashboard/index.html"
      className="w-full h-full border-0"
      title="Agent Dashboard"
    />
  )
}
```

Agents can build and compile a dashboard into `workspace/<templateId>/dashboard/`. The platform serves it at `/api/workspace/preview/<templateId>/*`.

Panel slots:
| Slot | Description |
|---|---|
| `main` | Full-width content area |
| `agent-card` | Small panel below each agent card |
| `sidebar` | Narrow panel in the left sidebar |

---

## 9. Installing a template

During development, point the Template Manager at the directory:

```
Settings → Template Manager → Install from directory
/absolute/path/to/my-template
```

Or via the API:

```bash
curl -X POST http://localhost:3000/api/templates/install \
  -H 'Content-Type: application/json' \
  -d '{"dir": "/absolute/path/to/my-template"}'
```

The install flow:
1. Reads and validates `template.json`
2. Checks required plugins — warns if any are not yet configured
3. Registers all template agents in the DB (`source: "template:my-template"`)
4. Scaffolds `workspace/my-template/` from `workspaceStructure`
5. Returns `{ template, missingPlugins }`

**Activate** a template to make it the active pipeline:

```bash
curl -X POST http://localhost:3000/api/templates/my-template/activate
```

---

## 10. Plugin requirements

Templates declare which plugins they need in `requiredPlugins`. The platform checks this on install and shows a warning for each missing or unconfigured plugin.

Configure plugins via the Plugin Manager (Settings → Plugins) or via:

```bash
# Set an env var for a plugin
curl -X POST http://localhost:3000/api/plugins/elevenlabs/configure \
  -H 'Content-Type: application/json' \
  -d '{"key": "ELEVENLABS_API_KEY", "value": "your-key-here"}'

# Check plugin health
curl http://localhost:3000/api/plugins/elevenlabs/health
```

---

## 11. Checklist before shipping

- [ ] `template.json` has all required fields (`id`, `version`, `displayName`, `agents`)
- [ ] Each agent has a `systemPromptFile` and `configFile` that exist on disk
- [ ] `isPipelineController: true` is set on exactly one agent
- [ ] All plugin tool IDs in agent configs are declared in `requiredPlugins`
- [ ] `PipelineRunner` emits `pipeline:stage` events for each stage transition
- [ ] `getState()` returns a valid `PipelineState` even before `start()` is called
- [ ] Schemas are TypeScript interfaces with an `export default` — no runtime code
- [ ] SOPs are written from the agent's perspective (imperative: "do X, then Y")
- [ ] `workspaceStructure` directory exists (even if empty with `.gitkeep`)

---

## Summary

| File | Required | Purpose |
|---|---|---|
| `template.json` | **Yes** | Manifest — defines everything |
| `agents/<name>.md` | **Yes** | System prompt per agent |
| `agents/<name>.config.json` | **Yes** | Model, tools, skills per agent |
| `pipeline/index.ts` | No* | Pipeline logic (required if `pipeline` key is in manifest) |
| `schemas/<name>.ts` | No | Data shape for pipeline artifacts |
| `sops/<name>.md` | No | Standard Operating Procedures for agents |
| `skills/<name>.md` | No | Domain knowledge documents |
| `ui/panels/<Panel>.tsx` | No | Custom React panels |
| `workspace/` | No | Starter workspace files |
