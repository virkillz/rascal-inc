import { CronExpressionParser } from 'cron-parser'
import { getDb, getSetting, type ScheduleRow } from './db.js'
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
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get(s.agent_id) as unknown as AgentRecord | undefined
      if (!agent) continue

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

      const triggerMsg = `[Scheduled: ${s.label || s.cron}] ${s.prompt}`
      db.prepare('INSERT INTO chat_messages (agent_id, role, content) VALUES (?, ?, ?)')
        .run(agent.id, 'user', triggerMsg)

      chatWithAgent(agent, triggerMsg, getDefaultModel())
        .then((reply) => {
          db.prepare('INSERT INTO chat_messages (agent_id, role, content) VALUES (?, ?, ?)')
            .run(agent.id, 'assistant', reply)
        })
        .catch(console.error)
    }
  }, 60_000)
}
