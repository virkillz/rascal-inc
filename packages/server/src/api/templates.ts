import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type TemplateRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import { loadTemplateFromDir, scaffoldWorkspace } from '../template-loader.js'
import type { AgentRow } from './agents.js'

const AVATAR_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
  '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
]
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function rowToTemplate(row: TemplateRow) {
  return {
    ...row,
    manifest: JSON.parse(row.manifest),
    isActive: row.is_active === 1,
  }
}

let _workspaceDir = ''
export function setTemplatesWorkspaceDir(dir: string) {
  _workspaceDir = dir
}

export function createTemplatesRouter(): Router {
  const router = Router()

  // GET /api/templates
  router.get('/', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM templates ORDER BY installed_at ASC').all() as TemplateRow[]
    res.json(rows.map(rowToTemplate))
  })

  // GET /api/templates/:id
  router.get('/:id', (req, res) => {
    const row = getDb().prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as TemplateRow | undefined
    if (!row) return res.status(404).json({ error: 'Template not found' })
    res.json(rowToTemplate(row))
  })

  // POST /api/templates/install  — body: { dir: string } (absolute path to template dir)
  router.post('/install', (req, res) => {
    const { dir } = req.body as { dir?: string }
    if (!dir) return res.status(400).json({ error: '"dir" required — absolute path to template directory' })

    let loaded
    try {
      loaded = loadTemplateFromDir(dir)
    } catch (err) {
      return res.status(422).json({ error: (err as Error).message })
    }

    const { manifest, agentPrompts, agentConfigs } = loaded
    const db = getDb()

    // Idempotent: if already installed, return existing
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(manifest.id) as TemplateRow | undefined
    if (existing) {
      return res.status(409).json({ error: `Template "${manifest.id}" is already installed`, template: rowToTemplate(existing) })
    }

    // Check required plugins (warn, don't block)
    const missingPlugins: string[] = []
    for (const pluginId of manifest.requiredPlugins ?? []) {
      const plugin = db.prepare('SELECT configured FROM plugins WHERE id = ?').get(pluginId) as { configured: number } | undefined
      if (!plugin || plugin.configured === 0) {
        missingPlugins.push(pluginId)
      }
    }

    // Register agents from manifest
    for (const agentDef of manifest.agents) {
      const agentConfig = agentConfigs[agentDef.id] ?? {}
      const agentId = randomUUID()
      db.prepare(`
        INSERT INTO agents (id, name, role, description, system_prompt, model_config, source, avatar_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agentId,
        agentDef.name,
        agentDef.role,
        '',
        agentPrompts[agentDef.id] ?? '',
        JSON.stringify({ defaultModel: agentConfig.defaultModel, tools: agentConfig.tools ?? [] }),
        `template:${manifest.id}`,
        randomColor(),
      )
    }

    // Scaffold workspace subdirectory
    if (_workspaceDir) {
      scaffoldWorkspace(loaded, _workspaceDir)
    }

    // Store template record
    db.prepare(`
      INSERT INTO templates (id, display_name, version, description, manifest, is_active)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(
      manifest.id,
      manifest.displayName,
      manifest.version,
      manifest.description ?? '',
      JSON.stringify(manifest),
    )

    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(manifest.id) as TemplateRow
    eventBus.emit({ type: 'template:installed', template: row })

    res.status(201).json({
      template: rowToTemplate(row),
      missingPlugins,
    })
  })

  // POST /api/templates/:id/activate
  router.post('/:id/activate', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as TemplateRow | undefined
    if (!row) return res.status(404).json({ error: 'Template not found' })

    // Deactivate all, then activate this one
    db.prepare('UPDATE templates SET is_active = 0').run()
    db.prepare('UPDATE templates SET is_active = 1 WHERE id = ?').run(row.id)

    eventBus.emit({ type: 'template:activated', templateId: row.id })
    res.json({ ok: true, activeTemplateId: row.id })
  })

  // DELETE /api/templates/:id
  router.delete('/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as TemplateRow | undefined
    if (!row) return res.status(404).json({ error: 'Template not found' })

    // Remove template agents
    db.prepare(`DELETE FROM agents WHERE source = ?`).run(`template:${row.id}`)

    db.prepare('DELETE FROM templates WHERE id = ?').run(row.id)
    eventBus.emit({ type: 'template:uninstalled', templateId: row.id })
    res.json({ ok: true })
  })

  return router
}
