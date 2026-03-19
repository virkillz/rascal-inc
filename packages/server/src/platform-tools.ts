/**
 * Platform tools — workspace, memory, todos, pipeline control, and human gate.
 *
 * Each factory function returns a ToolDefinition (Pi SDK / TypeBox format)
 * scoped to a specific agent and workspace. Call buildAgentTools() to get
 * the set of tools appropriate for an agent's config and current context.
 */

import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { getDb } from './db.js'
import { createHumanGate } from './human-gate-service.js'
import { eventBus } from './event-bus.js'
import type { StageStatus } from './event-bus.js'
import { pluginLoader } from './plugin-loader.js'

// ── Result helper ─────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

// ── Workspace tools ───────────────────────────────────────────────────────────

export function makeWorkspaceReadTool(workspaceDir: string): ToolDefinition {
  return {
    name: 'workspace_read',
    label: 'Workspace Read',
    description:
      'Read a file from the shared project workspace. ' +
      `Workspace root: ${workspaceDir}. Paths are relative to the workspace root.`,
    parameters: Type.Object({
      path: Type.String({ description: 'File path relative to the workspace root' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const resolved = path.resolve(workspaceDir, params.path)
      if (!resolved.startsWith(workspaceDir)) throw new Error('Path traversal not allowed')
      if (!fs.existsSync(resolved)) throw new Error(`File not found: ${params.path}`)
      return ok(fs.readFileSync(resolved, 'utf-8'))
    },
  }
}

export function makeWorkspaceWriteTool(workspaceDir: string): ToolDefinition {
  return {
    name: 'workspace_write',
    label: 'Workspace Write',
    description:
      'Write or overwrite a file in the shared project workspace. ' +
      'Creates parent directories automatically. ' +
      `Workspace root: ${workspaceDir}. Paths are relative to the workspace root.`,
    parameters: Type.Object({
      path: Type.String({ description: 'File path relative to the workspace root' }),
      content: Type.String({ description: 'Content to write' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const resolved = path.resolve(workspaceDir, params.path)
      if (!resolved.startsWith(workspaceDir)) throw new Error('Path traversal not allowed')
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
      fs.writeFileSync(resolved, params.content, 'utf-8')
      return ok(`Written: ${params.path}`)
    },
  }
}

// ── Memory tools ──────────────────────────────────────────────────────────────

export function makeMemoryAddTool(agentId: string): ToolDefinition {
  return {
    name: 'memory_add',
    label: 'Save to Memory',
    description:
      'Save a piece of information to your persistent memory. ' +
      'Use this to remember facts, decisions, or context that will be useful in future conversations. ' +
      'Your memory is injected into your system prompt at the start of each session.',
    parameters: Type.Object({
      content: Type.String({ description: 'What to remember — be concise and factual' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      getDb()
        .prepare('INSERT INTO agent_memory (agent_id, content) VALUES (?, ?)')
        .run(agentId, params.content)
      return ok('Saved to memory.')
    },
  }
}

// ── Todo tools ────────────────────────────────────────────────────────────────

export function makeTodoAddTool(agentId: string): ToolDefinition {
  return {
    name: 'todo_add',
    label: 'Add Todo',
    description: 'Add a task to your open todo list. Todos are shown in your system prompt.',
    parameters: Type.Object({
      text: Type.String({ description: 'Task description' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const result = getDb()
        .prepare('INSERT INTO agent_todos (agent_id, text) VALUES (?, ?)')
        .run(agentId, params.text) as { lastInsertRowid: number | bigint }
      return ok(`Todo added (id: ${result.lastInsertRowid}).`)
    },
  }
}

export function makeTodoCompleteTool(agentId: string): ToolDefinition {
  return {
    name: 'todo_complete',
    label: 'Complete Todo',
    description: 'Mark one of your open todos as complete by its numeric ID.',
    parameters: Type.Object({
      id: Type.Number({ description: 'The numeric ID of the todo to mark complete' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      getDb()
        .prepare(
          `UPDATE agent_todos SET completed = 1, completed_at = datetime('now')
           WHERE id = ? AND agent_id = ?`,
        )
        .run(params.id, agentId)
      return ok(`Todo ${params.id} marked complete.`)
    },
  }
}

// ── Pipeline control tool ─────────────────────────────────────────────────────

export function makePipelineAdvanceTool(projectId: string): ToolDefinition {
  return {
    name: 'pipeline_advance',
    label: 'Pipeline: Advance Stage',
    description: 'Emit a stage status change for the active pipeline project.',
    parameters: Type.Object({
      stage: Type.String({ description: 'Stage name, e.g. "ideation" or "writing"' }),
      status: Type.Union(
        [
          Type.Literal('in-progress'),
          Type.Literal('complete'),
          Type.Literal('failed'),
          Type.Literal('cancelled'),
        ],
        { description: 'New status for the stage' },
      ),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      eventBus.emit({
        type: 'pipeline:stage',
        projectId,
        stage: params.stage,
        status: params.status as StageStatus,
      })
      return ok(`Stage "${params.stage}" → ${params.status}`)
    },
  }
}

// ── Human gate tool ───────────────────────────────────────────────────────────

export function makeHumanGateTool(projectId: string): ToolDefinition {
  return {
    name: 'human_gate',
    label: 'Human Gate',
    description:
      'Pause and wait for a human decision before continuing. ' +
      'The tool suspends until the human approves, revises, or rejects in the notification center. ' +
      'Returns the decision JSON.',
    parameters: Type.Object({
      id: Type.String({ description: 'Unique gate identifier, e.g. "concept-approval"' }),
      description: Type.String({ description: 'What the human needs to review or decide' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const gate = createHumanGate({
        id: params.id,
        projectId,
        description: params.description,
      })
      const decision = await gate.wait()
      return ok(JSON.stringify(decision))
    },
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export interface ToolContext {
  agentId: string
  workspaceDir: string
  projectId?: string
}

// Platform-owned tool IDs — handled here, not routed to plugin loader
const PLATFORM_TOOL_IDS = new Set([
  'workspace-read',
  'workspace-write',
  'pipeline-control',
  'human-gate',
])

/**
 * Build the list of custom ToolDefinitions for an agent session.
 *
 * Platform tool IDs (workspace-read, pipeline-control, etc.) are handled
 * directly. Any unknown ID is routed to the plugin loader, which checks
 * whether a plugin owns that tool ID.
 *
 * @param toolIds  The tool IDs declared in the agent's config
 * @param ctx      Agent-scoped context (id, workspace dir, optional project id)
 */
export function buildAgentTools(toolIds: string[], ctx: ToolContext): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  const pluginToolIds: string[] = []

  for (const id of toolIds) {
    if (PLATFORM_TOOL_IDS.has(id)) {
      switch (id) {
        case 'workspace-read':
          tools.push(makeWorkspaceReadTool(ctx.workspaceDir))
          break
        case 'workspace-write':
          tools.push(makeWorkspaceWriteTool(ctx.workspaceDir))
          break
        case 'pipeline-control':
          if (ctx.projectId) tools.push(makePipelineAdvanceTool(ctx.projectId))
          break
        case 'human-gate':
          if (ctx.projectId) tools.push(makeHumanGateTool(ctx.projectId))
          break
      }
    } else {
      // Unknown ID — may be owned by a plugin
      pluginToolIds.push(id)
    }
  }

  // Resolve plugin tools
  if (pluginToolIds.length > 0) {
    const pluginTools = pluginLoader.getToolsForIds(pluginToolIds, ctx)
    tools.push(...pluginTools)
  }

  // Every agent always gets memory and todo tools.
  tools.push(makeMemoryAddTool(ctx.agentId))
  tools.push(makeTodoAddTool(ctx.agentId))
  tools.push(makeTodoCompleteTool(ctx.agentId))

  return tools
}
