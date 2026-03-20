/**
 * Platform tools — workspace, memory, and todos.
 *
 * Each factory function returns a ToolDefinition (Pi SDK / TypeBox format)
 * scoped to a specific agent and workspace. Call buildAgentTools() to get
 * the set of tools appropriate for an agent's config.
 */

import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { getDb } from './db.js'
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

// ── Board tools ───────────────────────────────────────────────────────────────

export function makeBoardListCardsTool(): ToolDefinition {
  return {
    name: 'board_list_cards',
    label: 'List Board Cards',
    description: 'List cards on a board. Optionally filter by lane or assignee.',
    parameters: Type.Object({
      boardId: Type.String({ description: 'Board ID' }),
      laneId: Type.Optional(Type.String({ description: 'Filter by lane ID' })),
      assigneeId: Type.Optional(Type.String({ description: 'Filter by assignee ID' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      let query = 'SELECT * FROM cards WHERE board_id = ?'
      const args: string[] = [params.boardId]
      if (params.laneId) { query += ' AND lane_id = ?'; args.push(params.laneId) }
      if (params.assigneeId) { query += ' AND assignee_id = ?'; args.push(params.assigneeId) }
      query += ' ORDER BY position ASC'
      const cards = db.prepare(query).all(...args)
      return ok(JSON.stringify(cards, null, 2))
    },
  }
}

export function makeBoardCreateCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_create_card',
    label: 'Create Board Card',
    description: 'Create a new card on a board. You will be recorded as the creator.',
    parameters: Type.Object({
      boardId: Type.String({ description: 'Board ID' }),
      laneId: Type.String({ description: 'Lane ID to place the card in' }),
      title: Type.String({ description: 'Card title' }),
      description: Type.Optional(Type.String({ description: 'Task description' })),
      assigneeId: Type.Optional(Type.String({ description: 'ID of the assignee (agent or user)' })),
      assigneeType: Type.Optional(Type.Union([Type.Literal('agent'), Type.Literal('user')], { description: 'Type of assignee' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const { randomUUID } = await import('crypto')
      const db = getDb()
      const lane = db.prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(params.laneId, params.boardId) as { id: string; name: string } | undefined
      if (!lane) throw new Error(`Lane ${params.laneId} not found on board ${params.boardId}`)
      const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(params.laneId) as { c: number }).c
      const cardId = randomUUID()
      db.prepare(`
        INSERT INTO cards (id, board_id, lane_id, title, description, result, assignee_id, assignee_type, created_by, created_by_type, position)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 'agent', ?)
      `).run(cardId, params.boardId, params.laneId, params.title, params.description ?? '', params.assigneeId ?? null, params.assigneeType ?? null, agentId, pos)
      db.prepare(
        `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'created', ?)`
      ).run(cardId, params.boardId, agentId, JSON.stringify({ lane: lane.name, title: params.title }))
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId)
      return ok(JSON.stringify(card, null, 2))
    },
  }
}

export function makeBoardUpdateCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_update_card',
    label: 'Update Board Card',
    description: "Update a card's title, description, result, or assignee.",
    parameters: Type.Object({
      boardId: Type.String({ description: 'Board ID' }),
      cardId: Type.String({ description: 'Card ID' }),
      title: Type.Optional(Type.String({ description: 'New title' })),
      description: Type.Optional(Type.String({ description: 'New task description' })),
      result: Type.Optional(Type.String({ description: 'Result or output of the task' })),
      assigneeId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Assignee ID or null to unassign' })),
      assigneeType: Type.Optional(Type.Union([Type.Literal('agent'), Type.Literal('user'), Type.Null()], { description: 'Assignee type' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      const card = db.prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(params.cardId, params.boardId) as Record<string, unknown> | undefined
      if (!card) throw new Error(`Card ${params.cardId} not found`)
      const changed: string[] = []
      if (params.title !== undefined && params.title !== card.title) changed.push('title')
      if (params.description !== undefined && params.description !== card.description) changed.push('description')
      if (params.result !== undefined && params.result !== card.result) changed.push('result')
      if (params.assigneeId !== undefined && params.assigneeId !== card.assignee_id) changed.push('assignee')
      db.prepare(`
        UPDATE cards SET
          title = ?, description = ?, result = ?, assignee_id = ?, assignee_type = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        params.title ?? card.title,
        params.description ?? card.description,
        params.result ?? card.result,
        params.assigneeId !== undefined ? params.assigneeId : card.assignee_id,
        params.assigneeType !== undefined ? params.assigneeType : card.assignee_type,
        params.cardId,
      )
      if (changed.length > 0) {
        db.prepare(
          `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'updated', ?)`
        ).run(params.cardId, params.boardId, agentId, JSON.stringify({ changed }))
      }
      const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
      return ok(JSON.stringify(updated, null, 2))
    },
  }
}

export function makeBoardMoveCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_move_card',
    label: 'Move Board Card',
    description: 'Move a card to a different lane.',
    parameters: Type.Object({
      boardId: Type.String({ description: 'Board ID' }),
      cardId: Type.String({ description: 'Card ID' }),
      laneId: Type.String({ description: 'Destination lane ID' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      const card = db.prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(params.cardId, params.boardId) as Record<string, unknown> | undefined
      if (!card) throw new Error(`Card ${params.cardId} not found`)
      const toLane = db.prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(params.laneId, params.boardId) as { id: string; name: string } | undefined
      if (!toLane) throw new Error(`Lane ${params.laneId} not found on board ${params.boardId}`)
      const fromLane = db.prepare('SELECT name FROM lanes WHERE id = ?').get(card.lane_id as string) as { name: string } | undefined
      const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(params.laneId) as { c: number }).c
      db.prepare(`UPDATE cards SET lane_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?`).run(params.laneId, pos, params.cardId)
      db.prepare(
        `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'moved', ?)`
      ).run(params.cardId, params.boardId, agentId, JSON.stringify({ from_lane: fromLane?.name ?? '', to_lane: toLane.name }))
      const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
      return ok(JSON.stringify(updated, null, 2))
    },
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export interface ToolContext {
  agentId: string
  workspaceDir: string
}

const PLATFORM_TOOL_IDS = new Set([
  'workspace-read', 'workspace-write',
  'board_list_cards', 'board_create_card', 'board_update_card', 'board_move_card',
])

/**
 * Build the list of custom ToolDefinitions for an agent session.
 * Platform tool IDs are handled here; unknown IDs are routed to the plugin loader.
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
        case 'board_list_cards':
          tools.push(makeBoardListCardsTool())
          break
        case 'board_create_card':
          tools.push(makeBoardCreateCardTool(ctx.agentId))
          break
        case 'board_update_card':
          tools.push(makeBoardUpdateCardTool(ctx.agentId))
          break
        case 'board_move_card':
          tools.push(makeBoardMoveCardTool(ctx.agentId))
          break
      }
    } else {
      pluginToolIds.push(id)
    }
  }

  if (pluginToolIds.length > 0) {
    const pluginTools = pluginLoader.getToolsForIds(pluginToolIds, ctx)
    tools.push(...pluginTools)
  }

  // Every agent always gets memory, todo, and board tools
  tools.push(makeMemoryAddTool(ctx.agentId))
  tools.push(makeTodoAddTool(ctx.agentId))
  tools.push(makeTodoCompleteTool(ctx.agentId))
  tools.push(makeBoardListCardsTool())
  tools.push(makeBoardCreateCardTool(ctx.agentId))
  tools.push(makeBoardUpdateCardTool(ctx.agentId))
  tools.push(makeBoardMoveCardTool(ctx.agentId))

  return tools
}
