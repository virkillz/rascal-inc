/**
 * Platform tools — workspace, memory, and todos.
 *
 * Each factory function returns a ToolDefinition (Pi SDK / TypeBox format)
 * scoped to a specific agent and workspace. Call buildAgentTools() to get
 * the set of tools appropriate for an agent's config.
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Type } from '@sinclair/typebox'
import { CronExpressionParser } from 'cron-parser'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { getDb, getAgentChannels, getRecentChannelMessages } from './db.js'
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

/** Returns all lanes on the single board — agents use this to discover lane IDs. */
export function makeBoardListLanesTool(): ToolDefinition {
  return {
    name: 'board_list_lanes',
    label: 'List Board Lanes',
    description:
      'List all available lanes on the board. Returns each lane with its id, name, type (todo/in_progress/done), and description. ' +
      'Use this to discover lane IDs before moving cards.',
    parameters: Type.Object({}),
    execute: async () => {
      const db = getDb()
      const board = db.prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
      if (!board) throw new Error('No board found')
      const lanes = db.prepare('SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC').all(board.id)
      return ok(JSON.stringify(lanes, null, 2))
    },
  }
}

/** Returns all agents on the platform — use this to look up a teammate's ID before assigning a card. */
export function makeBoardListAgentsTool(): ToolDefinition {
  return {
    name: 'board_list_agents',
    label: 'List Agents',
    description:
      'List all agents on the platform with their id, name, role, and description. ' +
      'Use this to look up an agent\'s ID before setting them as an assignee on a card.',
    parameters: Type.Object({}),
    execute: async () => {
      const agents = getDb()
        .prepare('SELECT id, name, role, description FROM agents ORDER BY name ASC')
        .all()
      return ok(JSON.stringify(agents, null, 2))
    },
  }
}

/** Returns only the cards assigned to this agent, optionally filtered by lane type. */
export function makeBoardListMyCardsTool(agentId: string): ToolDefinition {
  return {
    name: 'board_list_my_cards',
    label: 'List My Cards',
    description:
      'List cards assigned to you. Optionally filter by card type: todo, in_progress, or done.',
    parameters: Type.Object({
      laneType: Type.Optional(
        Type.Union(
          [Type.Literal('todo'), Type.Literal('in_progress'), Type.Literal('done')],
          { description: 'Filter by lane type' },
        ),
      ),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      let query =
        `SELECT c.* FROM cards c JOIN lanes l ON l.id = c.lane_id ` +
        `WHERE c.assignee_id = ? AND c.is_archived = 0`
      const args: string[] = [agentId]
      if (params.laneType) {
        query += ' AND l.lane_type = ?'
        args.push(params.laneType)
      }
      query += ' ORDER BY c.position ASC'
      const cards = db.prepare(query).all(...args)
      return ok(JSON.stringify(cards, null, 2))
    },
  }
}

/** Create a card — automatically placed in the todo lane. No board or lane ID needed. */
export function makeBoardCreateCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_create_card',
    label: 'Create Board Card',
    description:
      'Create a new task card. It is automatically placed in the Todo lane. ' +
      'You will be recorded as the creator.',
    parameters: Type.Object({
      title: Type.String({ description: 'Card title' }),
      description: Type.Optional(Type.String({ description: 'Task description' })),
      assigneeId: Type.Optional(Type.String({ description: 'ID of the assignee (agent or user)' })),
      assigneeType: Type.Optional(
        Type.Union([Type.Literal('agent'), Type.Literal('user')], { description: 'Type of assignee' }),
      ),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const { randomUUID } = await import('crypto')
      const db = getDb()
      const board = db.prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
      if (!board) throw new Error('No board found')
      const lane = db.prepare("SELECT id, name FROM lanes WHERE board_id = ? AND lane_type = 'todo' LIMIT 1").get(board.id) as { id: string; name: string } | undefined
      if (!lane) throw new Error('No todo lane found on the board')
      const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(lane.id) as { c: number }).c
      const cardId = randomUUID()
      db.prepare(`
        INSERT INTO cards (id, board_id, lane_id, title, description, result, assignee_id, assignee_type, created_by, created_by_type, position)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 'agent', ?)
      `).run(cardId, board.id, lane.id, params.title, params.description ?? '', params.assigneeId ?? null, params.assigneeType ?? null, agentId, pos)
      db.prepare(
        `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'created', ?)`
      ).run(cardId, board.id, agentId, JSON.stringify({ lane: lane.name, title: params.title }))
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId)
      return ok(JSON.stringify(card, null, 2))
    },
  }
}

/** Update a card's title, description, result, or assignee. No board ID needed. */
export function makeBoardUpdateCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_update_card',
    label: 'Update Board Card',
    description: "Update a card's title, description, result, or assignee.",
    parameters: Type.Object({
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
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId) as Record<string, unknown> | undefined
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
        ).run(params.cardId, card.board_id as string, agentId, JSON.stringify({ changed }))
      }
      const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
      return ok(JSON.stringify(updated, null, 2))
    },
  }
}

/** Move a card to a different lane. No board ID needed — resolved from the card itself. */
export function makeBoardMoveCardTool(agentId: string): ToolDefinition {
  return {
    name: 'board_move_card',
    label: 'Move Board Card',
    description:
      'Move a card to a different lane. Use board_list_lanes to get available lane IDs.',
    parameters: Type.Object({
      cardId: Type.String({ description: 'Card ID' }),
      laneId: Type.String({ description: 'Destination lane ID' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId) as Record<string, unknown> | undefined
      if (!card) throw new Error(`Card ${params.cardId} not found`)
      const boardId = card.board_id as string
      const toLane = db.prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(params.laneId, boardId) as { id: string; name: string } | undefined
      if (!toLane) throw new Error(`Lane ${params.laneId} not found on this board`)
      const fromLane = db.prepare('SELECT name FROM lanes WHERE id = ?').get(card.lane_id as string) as { name: string } | undefined
      const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(params.laneId) as { c: number }).c
      db.prepare(`UPDATE cards SET lane_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?`).run(params.laneId, pos, params.cardId)
      db.prepare(
        `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'moved', ?)`
      ).run(params.cardId, boardId, agentId, JSON.stringify({ from_lane: fromLane?.name ?? '', to_lane: toLane.name }))
      const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
      return ok(JSON.stringify(updated, null, 2))
    },
  }
}

// ── Agent creation tool ───────────────────────────────────────────────────────

/** Hire (create) a new agent on the platform. */
export function makeCreateAgentTool(): ToolDefinition {
  return {
    name: 'create_agent',
    label: 'Hire Agent',
    description:
      'Create a new AI agent on the platform. Use this to hire a specialist for a specific role or task. ' +
      'Returns the new agent\'s id, name, role, and description.',
    parameters: Type.Object({
      name: Type.String({ description: 'Agent name' }),
      role: Type.String({ description: 'Agent role or job title (e.g. "Copywriter", "Data Analyst")' }),
      description: Type.Optional(Type.String({ description: 'Short description of what this agent does' })),
      systemPrompt: Type.Optional(Type.String({ description: 'System prompt / instructions for the agent' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const { randomUUID } = await import('crypto')
      const db = getDb()
      const AVATAR_COLORS = [
        '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
        '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
      ]
      const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
      const avatarUrl = `/default_avatar/avatar_${Math.floor(Math.random() * 17) + 1}.jpg`
      const agentId = randomUUID()
      db.prepare(`
        INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color, avatar_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agentId,
        params.name.trim(),
        params.role.trim(),
        params.description?.trim() ?? '',
        params.systemPrompt?.trim() ?? '',
        '{}',
        avatarColor,
        avatarUrl,
      )
      const { eventBus } = await import('./event-bus.js')
      eventBus.emit({ type: 'agent:created', agentId })
      const agent = db.prepare('SELECT id, name, role, description FROM agents WHERE id = ?').get(agentId)
      return ok(JSON.stringify(agent, null, 2))
    },
  }
}

// ── DM helper ─────────────────────────────────────────────────────────────────

function findOrCreateDmChannel(
  db: ReturnType<typeof getDb>,
  agentId: string,
  userId: string,
): string {
  const existing = db.prepare(`
    SELECT cm1.channel_id
    FROM channel_members cm1
    JOIN channel_members cm2 ON cm1.channel_id = cm2.channel_id
    JOIN channels c ON c.id = cm1.channel_id
    WHERE c.is_dm = 1
      AND cm1.member_id = ? AND cm1.member_type = 'agent'
      AND cm2.member_id = ? AND cm2.member_type = 'user'
  `).get(agentId, userId) as { channel_id: string } | undefined

  if (existing) return existing.channel_id

  const channelId = randomUUID()
  db.prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, '', 1)").run(channelId)
  db.prepare('INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)').run(channelId, agentId, 'agent')
  db.prepare('INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)').run(channelId, userId, 'user')
  return channelId
}

// ── Direct message tool ───────────────────────────────────────────────────────

export function makeSendDirectMessageTool(agentId: string): ToolDefinition {
  return {
    name: 'send_direct_message',
    label: 'Send Direct Message',
    description:
      'Send a direct message to a human user. Use this to proactively notify the workspace owner or a specific user about reports, alerts, or task completions. ' +
      'You cannot message other AI agents with this tool. If no user_id is provided, defaults to the workspace owner/admin.',
    parameters: Type.Object({
      message: Type.String({ description: 'The message to send' }),
      user_id: Type.Optional(Type.String({ description: 'Target user ID. Omit to send to workspace owner.' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()

      let targetUserId: string = params.user_id
      if (!targetUserId) {
        const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1').get() as { id: string } | undefined
        if (!admin) throw new Error('No admin user found. Please complete setup.')
        targetUserId = admin.id
      }

      const targetUser = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(targetUserId) as { id: string; display_name: string } | undefined
      if (!targetUser) throw new Error(`User ${targetUserId} not found. Note: you can only message human users, not agents.`)

      const channelId = findOrCreateDmChannel(db, agentId, targetUserId)

      const result = db.prepare(
        "INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, 'agent', ?)"
      ).run(channelId, agentId, params.message) as { lastInsertRowid: number | bigint }

      const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string }
      const { eventBus } = await import('./event-bus.js')
      eventBus.emit({
        type: 'channel:message',
        channelId,
        senderId: agentId,
        senderType: 'agent',
        senderName: agent.name,
        content: params.message,
        messageId: result.lastInsertRowid as number,
      })

      return ok(JSON.stringify({ success: true, channel_id: channelId, message_id: result.lastInsertRowid }))
    },
  }
}

// ── Create schedule tool ──────────────────────────────────────────────────────

export function makeCreateScheduleTool(agentId: string): ToolDefinition {
  return {
    name: 'create_schedule',
    label: 'Create Schedule',
    description:
      'Create a recurring scheduled task for yourself. Use this to set up reports, reminders, or recurring actions on a cron schedule.',
    parameters: Type.Object({
      label: Type.String({ description: "A short name for this schedule, e.g. 'Daily report to admin'" }),
      cron: Type.String({ description: "Cron expression, e.g. '0 11 * * *' for daily at 11am UTC" }),
      prompt: Type.String({ description: 'The task instructions that will run on this schedule' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      let nextRun: Date
      try {
        nextRun = CronExpressionParser.parse(params.cron).next().toDate()
      } catch {
        throw new Error(`Invalid cron expression: "${params.cron}". Example: "0 11 * * *" for daily at 11am.`)
      }

      const db = getDb()
      const result = db.prepare(`
        INSERT INTO agent_schedules (agent_id, cron, prompt, label, enabled, next_run_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(agentId, params.cron, params.prompt, params.label, nextRun.toISOString()) as { lastInsertRowid: number | bigint }

      const { eventBus } = await import('./event-bus.js')
      eventBus.emit({ type: 'schedule:created', agentId, scheduleId: result.lastInsertRowid as number, label: params.label })

      return ok(JSON.stringify({ success: true, schedule_id: result.lastInsertRowid, next_run_at: nextRun.toISOString() }))
    },
  }
}

// ── Channel tools ─────────────────────────────────────────────────────────────

/** List the channels this agent is a member of. */
export function makeChannelListTool(agentId: string): ToolDefinition {
  return {
    name: 'channel_list',
    label: 'List My Channels',
    description:
      'List all channels you are a member of. Returns channel id and name. ' +
      'Use channel_post to send a message to one of these channels.',
    parameters: Type.Object({}),
    execute: async () => {
      const channels = getAgentChannels(agentId)
      if (!channels.length) return ok('You are not a member of any channels.')
      return ok(JSON.stringify(channels, null, 2))
    },
  }
}

/** Fetch the last N messages from a channel. */
export function makeChannelGetMessagesTool(agentId: string): ToolDefinition {
  return {
    name: 'channel_get_messages',
    label: 'Get Channel Messages',
    description:
      'Fetch the last 10 messages from a channel you are a member of. ' +
      'Use channel_list to get channel IDs.',
    parameters: Type.Object({
      channelId: Type.String({ description: 'ID of the channel to read' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      const membership = db
        .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND member_id = ?')
        .get(params.channelId, agentId)
      if (!membership) throw new Error('You are not a member of that channel.')
      const messages = getRecentChannelMessages(params.channelId, 10).reverse()
      if (!messages.length) return ok('No messages yet.')
      return ok(JSON.stringify(messages, null, 2))
    },
  }
}

/** Post a message to a channel as this agent. */
export function makeChannelPostTool(agentId: string): ToolDefinition {
  return {
    name: 'channel_post',
    label: 'Post to Channel',
    description:
      'Post a message to a channel. Use this to communicate updates, ask questions, or share results with the team. ' +
      'The channelId is available in your system prompt under ## Channels.',
    parameters: Type.Object({
      channelId: Type.String({ description: 'ID of the channel to post to' }),
      content: Type.String({ description: 'The message content' }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (_id, params: any) => {
      const db = getDb()
      const channel = db.prepare('SELECT id, name FROM channels WHERE id = ? AND is_dm = 0').get(params.channelId) as { id: string; name: string } | undefined
      if (!channel) throw new Error(`Channel not found: ${params.channelId}`)
      const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string } | undefined
      const agentName = agent?.name ?? agentId

      const { eventBus } = await import('./event-bus.js')
      const msgId = (db
        .prepare('INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)')
        .run(params.channelId, agentId, 'agent', params.content.trim()) as { lastInsertRowid: number | bigint }).lastInsertRowid as number

      eventBus.emit({
        type: 'channel:message',
        channelId: params.channelId,
        senderId: agentId,
        senderType: 'agent',
        senderName: agentName,
        content: params.content.trim(),
        messageId: msgId,
      })

      return ok(`Message posted to #${channel.name}`)
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
  'board_list_agents', 'board_list_lanes', 'board_list_my_cards', 'board_create_card', 'board_update_card', 'board_move_card',
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
        case 'board_list_agents':
          tools.push(makeBoardListAgentsTool())
          break
        case 'board_list_lanes':
          tools.push(makeBoardListLanesTool())
          break
        case 'board_list_my_cards':
          tools.push(makeBoardListMyCardsTool(ctx.agentId))
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

  // Every agent always gets memory, todo, board, and channel tools
  tools.push(makeMemoryAddTool(ctx.agentId))
  tools.push(makeTodoAddTool(ctx.agentId))
  tools.push(makeTodoCompleteTool(ctx.agentId))
  tools.push(makeBoardListAgentsTool())
  tools.push(makeBoardListLanesTool())
  tools.push(makeBoardListMyCardsTool(ctx.agentId))
  tools.push(makeBoardCreateCardTool(ctx.agentId))
  tools.push(makeBoardUpdateCardTool(ctx.agentId))
  tools.push(makeBoardMoveCardTool(ctx.agentId))
  tools.push(makeChannelListTool(ctx.agentId))
  tools.push(makeChannelGetMessagesTool(ctx.agentId))
  tools.push(makeChannelPostTool(ctx.agentId))
  tools.push(makeCreateAgentTool())
  tools.push(makeSendDirectMessageTool(ctx.agentId))
  tools.push(makeCreateScheduleTool(ctx.agentId))

  return tools
}
