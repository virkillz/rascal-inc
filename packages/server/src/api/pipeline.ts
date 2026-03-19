import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type PipelineProjectRow } from '../db.js'
import { pipelineManager } from '../pipeline-manager.js'

function rowToProject(row: PipelineProjectRow) {
  return {
    ...row,
    state: JSON.parse(row.state),
    input: JSON.parse(row.input),
  }
}

export function createPipelineRouter(): Router {
  const router = Router()

  // GET /api/projects
  router.get('/', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM pipeline_projects ORDER BY created_at DESC').all() as PipelineProjectRow[]
    res.json(rows.map(rowToProject))
  })

  // GET /api/projects/:id
  router.get('/:id', (req, res) => {
    const row = getDb().prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(req.params.id) as PipelineProjectRow | undefined
    if (!row) return res.status(404).json({ error: 'Project not found' })
    res.json(rowToProject(row))
  })

  // GET /api/projects/:id/state — live state from the runner
  router.get('/:id/state', async (req, res) => {
    try {
      const state = await pipelineManager.getState(req.params.id)
      if (!state) return res.status(404).json({ error: 'Project not found' })
      res.json(state)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // POST /api/projects — create a new project
  router.post('/', (req, res) => {
    const { templateId, name, input } = req.body as { templateId?: string; name?: string; input?: unknown }
    if (!templateId) return res.status(400).json({ error: '"templateId" required' })

    const template = getDb().prepare('SELECT id FROM templates WHERE id = ?').get(templateId)
    if (!template) return res.status(404).json({ error: 'Template not found' })

    const id = randomUUID()
    getDb().prepare(`
      INSERT INTO pipeline_projects (id, template_id, name, status, state, input)
      VALUES (?, ?, ?, 'idle', '{}', ?)
    `).run(id, templateId, name?.trim() ?? `Project ${new Date().toLocaleDateString()}`, JSON.stringify(input ?? {}))

    const row = getDb().prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(id) as PipelineProjectRow
    res.status(201).json(rowToProject(row))
  })

  // POST /api/projects/:id/start
  router.post('/:id/start', async (req, res) => {
    const row = getDb().prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(req.params.id) as PipelineProjectRow | undefined
    if (!row) return res.status(404).json({ error: 'Project not found' })
    if (row.status === 'running') return res.status(409).json({ error: 'Project already running' })

    try {
      // Fire-and-forget — start() is async and may run for a long time
      pipelineManager.start(row.id, JSON.parse(row.input)).catch(console.error)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // POST /api/projects/:id/pause
  router.post('/:id/pause', async (req, res) => {
    try {
      await pipelineManager.pause(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // DELETE /api/projects/:id
  router.delete('/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(req.params.id) as PipelineProjectRow | undefined
    if (!row) return res.status(404).json({ error: 'Project not found' })
    pipelineManager.deleteRunner(row.id)
    db.prepare('DELETE FROM pipeline_projects WHERE id = ?').run(row.id)
    res.json({ ok: true })
  })

  return router
}
