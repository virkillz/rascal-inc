# How to Create a Template for rascal-inc

A **template** is a TypeScript package that brings a domain-specific agent team, pipeline, and UI to the rascal-inc platform. The platform runs the template; the template never runs standalone.

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
├── tools/
│   └── my-tool.ts         # Optional domain-specific tool definitions
├── skills/
│   └── domain-guide.md    # Optional template skill docs
├── ui/
│   └── panels/
│       └── PipelineView.tsx  # Optional custom React panels
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
  "requiredPlugins": ["elevenlabs", "youtube"],
  "optionalPlugins": ["slack"],

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

Write the agent's system prompt in plain Markdown. You can reference the company context, the pipeline stage, or tool names.

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
    "pipeline-control"  // platform-provided tool IDs
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

Plugin tools are exposed automatically when the plugin is configured. For example, with the `elevenlabs` plugin configured, the `elevenlabs-tts` tool becomes available.

---

## 4. PipelineRunner (`pipeline/index.ts`)

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

// In-memory state keyed by projectId
const states = new Map<string, PipelineState>()

export class MyPipeline implements PipelineRunner {
  async start(projectId: string, input: unknown): Promise<void> {
    const events = useEventBus()
    const workspace = useWorkspace(projectId)

    // Initialise state
    states.set(projectId, {
      projectId,
      currentStage: 'ideation',
      stages: {
        ideation: 'in-progress',
        writing: 'pending',
        review: 'pending',
      },
      errors: [],
    })

    events.emit('pipeline:stage', { projectId, stage: 'ideation', status: 'in-progress' })

    // --- Stage 1: ideation ---
    // Run an agent, write output to workspace, advance stage…
    await workspace.write('brief.json', { topic: (input as any).topic })

    // Create a human gate before the next stage
    const gate = createHumanGate({
      id: 'brief-approval',
      projectId,
      description: 'Approve the creative brief before writing begins.',
      artifact: { topic: (input as any).topic },
    })

    states.get(projectId)!.waitingForGate = {
      gateId: 'brief-approval',
      description: 'Approve the creative brief.',
    }
    events.emit('pipeline:stage', { projectId, stage: 'ideation', status: 'awaiting-approval' })

    const decision = await gate.wait()  // suspends here

    if (decision.action === 'reject') {
      states.get(projectId)!.stages.ideation = 'cancelled'
      return
    }

    // --- Stage 2: writing ---
    states.get(projectId)!.stages.ideation = 'complete'
    states.get(projectId)!.currentStage = 'writing'
    states.get(projectId)!.stages.writing = 'in-progress'
    states.get(projectId)!.waitingForGate = undefined
    events.emit('pipeline:stage', { projectId, stage: 'writing', status: 'in-progress' })

    // … write stage logic here …

    states.get(projectId)!.stages.writing = 'complete'
    states.get(projectId)!.stages.review = 'complete'
    states.get(projectId)!.currentStage = 'review'
  }

  async pause(projectId: string): Promise<void> {
    // Nothing async needed for a simple in-memory runner.
    // For long-running work, save a checkpoint here.
    const s = states.get(projectId)
    if (s) s.currentStage = 'paused'
  }

  async resume(projectId: string, gateId: string, decision: GateDecision): Promise<void> {
    // Gate resolution is handled by human-gate-service automatically.
    // This method is called by the platform if you need custom resume logic.
  }

  async getState(projectId: string): Promise<PipelineState> {
    return states.get(projectId) ?? {
      projectId,
      currentStage: 'idle',
      stages: {},
      errors: [],
    }
  }
}

// Export a factory function — the platform calls this
export default () => new MyPipeline()
```

### PipelineState shape

```ts
interface PipelineState {
  projectId: string
  currentStage: string
  stages: Record<string, StageStatus>  // see below
  activeAgentId?: string               // shown in the UI as "working"
  errors: PipelineError[]
  waitingForGate?: { gateId: string; description: string }
}

type StageStatus =
  | 'pending'
  | 'in-progress'
  | 'awaiting-approval'
  | 'complete'
  | 'failed'
  | 'cancelled'
```

### Important rules

1. **Own your state.** The pipeline is responsible for persisting its state. Use `useWorkspace()` to write a `status.json` if you want to survive process restarts.
2. **Emit events.** Emit `pipeline:stage` events whenever a stage changes so the UI reflects progress in real time.
3. **Gates suspend execution.** `gate.wait()` returns a Promise that resolves only when the human clicks Approve/Revise/Reject in the notification center. The pipeline process is suspended until then.
4. **Handle `pause()`.** The platform calls `pause()` on server shutdown. Save enough state to resume.

---

## 5. Domain tools (`tools/<name>.ts`)

Optional tools your agents can call. Uses the Pi SDK `ToolDefinition` format.

```ts
import type { ToolDefinition } from '@mariozechner/pi'

export const searchYouTube: ToolDefinition = {
  name: 'search_youtube',
  description: 'Search YouTube for videos matching a query.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'number', description: 'Maximum results to return', default: 5 },
    },
    required: ['query'],
  },
  async execute({ query, max_results = 5 }) {
    // implementation…
    return { results: [] }
  },
}
```

Reference a tool in `agents/<name>.config.json` by the exported constant name, or register it in the template's pipeline with `defineAgent({ additionalTools: [searchYouTube] })`.

---

## 6. Template skills (`skills/<name>.md`)

Skills are instruction documents injected into an agent's system prompt. Write them as plain Markdown.

```markdown
# YouTube SEO Guide

When writing titles and descriptions for YouTube videos, follow these rules:

1. **Title**: 60 characters or fewer. Include the primary keyword in the first 5 words.
2. **Description**: First 2 lines appear in search results — make them count.
3. **Tags**: Use 10–15 tags. Mix broad and specific terms.
4. **Thumbnail**: Ask Gemini to generate a thumbnail that uses high-contrast colours
   and shows a human face where relevant.

## Keyword research

Use the `search_youtube` tool to find top-performing videos on the same topic.
Analyse their titles and descriptions to extract winning patterns.
```

Assign a skill to an agent in `agents/<name>.config.json`:

```jsonc
{
  "skills": ["my-template/youtube-seo"]
}
```

---

## 7. Custom UI panels (`ui/panels/<Panel>.tsx`)

Panels are React components rendered in slots defined in `template.json`. The platform provides the panel slot system; the template provides the component.

```tsx
// ui/panels/PipelineView.tsx
import { useStore } from 'rascal-inc/ui'

export default function PipelineView() {
  const { projects } = useStore()
  const project = projects[0]  // or filter by template

  return (
    <div className="p-4">
      <h2 className="font-bold mb-3">Pipeline</h2>
      {project
        ? Object.entries(project.state.stages).map(([stage, status]) => (
            <div key={stage} className="flex items-center gap-2 text-sm mb-1">
              <StatusDot status={status} />
              <span className="capitalize">{stage}</span>
            </div>
          ))
        : <p className="text-gray-400">No active project.</p>
      }
    </div>
  )
}
```

Panel slots:
| Slot | Description |
|---|---|
| `main` | Full-width content area (replaces or augments the default view) |
| `agent-card` | Small panel shown below each agent card on the roster |
| `sidebar` | Narrow panel injected into the left sidebar |

---

## 8. Installing a template

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
2. Checks required plugins — warns if any are not configured
3. Registers all template agents in the DB (`source: "template:my-template"`)
4. Scaffolds `workspace/my-template/` from `workspaceStructure`
5. Returns `{ template, missingPlugins }`

**Activate** a template to make it the active pipeline (one active at a time):

```bash
curl -X POST http://localhost:3000/api/templates/my-template/activate
```

---

## 9. Plugin requirements

Templates declare which plugins they need in `requiredPlugins`. The platform checks this on install and shows a warning for each missing plugin.

| Plugin ID | Service |
|---|---|
| `elevenlabs` | ElevenLabs TTS |
| `gemini-image` | Gemini image generation |
| `youtube` | YouTube upload |
| `slack` | Slack messaging |
| `notion` | Notion read/write |
| `github` | GitHub repo operations |
| `openai` | OpenAI / DALL-E |

Configure plugins in the Plugin Manager (Settings → Plugins) or via:

```bash
curl -X POST http://localhost:3000/api/plugins/elevenlabs/configure \
  -H 'Content-Type: application/json' \
  -d '{"apiKey": "your-key-here"}'
```

---

## 10. Checklist before shipping

- [ ] `template.json` has all required fields (`id`, `version`, `displayName`, `agents`)
- [ ] Each agent has a `systemPromptFile` and `configFile` that exist on disk
- [ ] `isPipelineController: true` is set on exactly one agent (the one that drives the pipeline)
- [ ] `PipelineRunner` emits `pipeline:stage` events for each stage transition
- [ ] `getState()` returns a valid `PipelineState` even before `start()` is called
- [ ] Human gates have descriptive `description` strings (shown to the user in the notification center)
- [ ] `workspaceStructure` directory exists (even if empty with `.gitkeep`)
- [ ] Required plugins are declared in `requiredPlugins`
- [ ] Skills are factual and concise — they are injected verbatim into the system prompt

---

## Summary

| File | Required | Purpose |
|---|---|---|
| `template.json` | **Yes** | Manifest — defines everything |
| `agents/<name>.md` | **Yes** | System prompt per agent |
| `agents/<name>.config.json` | **Yes** | Model, tools, skills per agent |
| `pipeline/index.ts` | No* | Pipeline logic (required if `pipeline` key is in manifest) |
| `tools/<name>.ts` | No | Domain-specific tools |
| `skills/<name>.md` | No | Domain knowledge documents |
| `ui/panels/<Panel>.tsx` | No | Custom React panels |
| `workspace/` | No | Starter workspace files |
