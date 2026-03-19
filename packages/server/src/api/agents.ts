import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb } from '../db.js'
import { clearSession } from '../agent-runner.js'

export interface AgentRow {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
  source: string
  avatar_color: string
  created_at: string
  updated_at: string
}

const AVATAR_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
  '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
]

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export function createAgentsRouter(): Router {
  const router = Router()

  // GET /api/agents
  router.get('/', (_req, res) => {
    const agents = getDb().prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as unknown as AgentRow[]
    res.json(agents.map(row => ({
      ...row,
      modelConfig: JSON.parse(row.model_config || '{}'),
    })))
  })

  // GET /api/agents/:id
  router.get('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json({ ...agent, modelConfig: JSON.parse(agent.model_config || '{}') })
  })

  // POST /api/agents
  router.post('/', (req, res) => {
    const { name, role, description, systemPrompt, modelConfig } = req.body as {
      name: string
      role: string
      description?: string
      systemPrompt?: string
      modelConfig?: object
    }

    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    if (!role?.trim()) return res.status(400).json({ error: 'role required' })

    const id = randomUUID()
    getDb().prepare(`
      INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      role.trim(),
      description?.trim() ?? '',
      systemPrompt?.trim() ?? '',
      JSON.stringify(modelConfig ?? {}),
      randomColor(),
    )

    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as unknown as AgentRow
    res.status(201).json({ ...agent, modelConfig: JSON.parse(agent.model_config) })
  })

  // PUT /api/agents/:id
  router.put('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { name, role, description, systemPrompt, modelConfig, avatarColor } = req.body as {
      name?: string
      role?: string
      description?: string
      systemPrompt?: string
      modelConfig?: object
      avatarColor?: string
    }

    getDb().prepare(`
      UPDATE agents SET
        name = ?,
        role = ?,
        description = ?,
        system_prompt = ?,
        model_config = ?,
        avatar_color = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name?.trim() ?? agent.name,
      role?.trim() ?? agent.role,
      description?.trim() ?? agent.description,
      systemPrompt?.trim() ?? agent.system_prompt,
      JSON.stringify(modelConfig ?? JSON.parse(agent.model_config)),
      avatarColor ?? agent.avatar_color,
      agent.id,
    )

    // Kill the live session so it picks up the new system prompt on next chat
    clearSession(agent.id)

    const updated = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as unknown as AgentRow
    res.json({ ...updated, modelConfig: JSON.parse(updated.model_config) })
  })

  // POST /api/agents/:id/toggle-active — activate or deactivate agent
  router.post('/:id/toggle-active', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    const newState = (agent as AgentRow & { is_active: number }).is_active ? 0 : 1
    getDb().prepare("UPDATE agents SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(newState, agent.id)
    if (!newState) clearSession(agent.id)
    res.json({ id: agent.id, is_active: newState === 1 })
  })

  // DELETE /api/agents/:id
  router.delete('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    clearSession(agent.id)
    getDb().prepare('DELETE FROM agents WHERE id = ?').run(agent.id)
    res.json({ ok: true })
  })

  return router
}
