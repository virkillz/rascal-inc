import { CronExpressionParser } from 'cron-parser'
import { getDb, getSetting, getAgentTodos, getPublicChannelId, getRecentChannelMessages, type ScheduleRow } from './db.js'
import { chatWithAgent, type AgentRecord, type ModelConfig } from './agent-runner.js'
import { eventBus } from './event-bus.js'

function computeNextRun(cron: string): string {
  return CronExpressionParser.parse(cron).next().toDate().toISOString()
}

function getDefaultModel(): ModelConfig {
  const stored = getSetting('default_model')
  if (stored) {
    try {
      return JSON.parse(stored) as ModelConfig
    } catch { /* fall through */ }
  }
  return { provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4-6', thinkingLevel: 'low' }
}

function buildSchedulerPrompt(schedule: ScheduleRow, agentName: string): string {
  // Include recent #public channel history so the agent has company context
  let channelContext = ''
  try {
    const channelId = getPublicChannelId()
    const messages = getRecentChannelMessages(channelId, 30)
    if (messages.length > 0) {
      const db = getDb()
      const lines = messages.map((m) => {
        const name = m.sender_type === 'agent'
          ? (db.prepare('SELECT name FROM agents WHERE id = ?').get(m.sender_id) as { name: string } | undefined)?.name ?? m.sender_id
          : (db.prepare('SELECT display_name FROM users WHERE id = ?').get(m.sender_id) as { display_name: string } | undefined)?.display_name ?? m.sender_id
        return `${name}: ${m.content}`
      })
      channelContext = `## Recent company channel activity\n${lines.join('\n')}\n\n`
    }
  } catch { /* no channel yet */ }

  return `${channelContext}[Scheduled task — ${schedule.label || schedule.cron}]\n${schedule.prompt}`
}

export function startScheduler(): void {
  const db = getDb()

  // Initialize next_run_at for enabled schedules that don't have one yet
  const uninitialized = db
    .prepare('SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at IS NULL')
    .all() as unknown as ScheduleRow[]
  for (const s of uninitialized) {
    try {
      db.prepare('UPDATE agent_schedules SET next_run_at = ? WHERE id = ?')
        .run(computeNextRun(s.cron), s.id)
    } catch { /* skip invalid cron */ }
  }

  setInterval(() => {
    const now = new Date().toISOString()
    const due = db
      .prepare('SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at <= ?')
      .all(now) as unknown as ScheduleRow[]

    for (const s of due) {
      const agent = db
        .prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1')
        .get(s.agent_id) as unknown as (AgentRecord & { is_active: number }) | undefined

      // Skip inactive agents
      if (!agent) continue

      // Skip if skip_if_no_todos is set and agent has no open todos
      if (s.skip_if_no_todos) {
        const openTodos = getAgentTodos(s.agent_id, true)
        if (openTodos.length === 0) {
          // Still advance next_run_at so it doesn't fire again immediately
          try {
            db.prepare('UPDATE agent_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
              .run(now, computeNextRun(s.cron), s.id)
          } catch { /* skip invalid cron */ }
          continue
        }
      }

      // Advance to next run before firing so a crash doesn't re-fire
      let nextRun: string
      try {
        nextRun = computeNextRun(s.cron)
      } catch {
        continue
      }
      db.prepare('UPDATE agent_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
        .run(now, nextRun, s.id)

      eventBus.emit({ type: 'schedule:fired', agentId: s.agent_id, scheduleId: s.id, label: s.label })

      const triggerMsg = buildSchedulerPrompt(s, agent.name)

      chatWithAgent(agent, triggerMsg, getDefaultModel())
        .catch(console.error)
    }
  }, 60_000)
}
