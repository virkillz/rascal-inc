import { Router } from 'express'
import { getDb, type PluginRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import fs from 'fs'

// ── Built-in plugin registry ──────────────────────────────────────────────────
// These are the slots described in the PLAN. Actual tool implementations
// would ship with plugin packages; for Phase 3 we register the slots so the
// plugin manager UI can show them and allow key configuration.

const BUILT_IN_PLUGINS: Omit<PluginRow, 'configured'>[] = [
  { id: 'elevenlabs',    display_name: 'ElevenLabs',    description: 'Text-to-speech audio generation' },
  { id: 'gemini-image',  display_name: 'Gemini Image',  description: 'Image generation via Google Gemini' },
  { id: 'youtube',       display_name: 'YouTube',        description: 'Upload and manage YouTube videos' },
  { id: 'slack',         display_name: 'Slack',          description: 'Send messages and notifications to Slack' },
  { id: 'notion',        display_name: 'Notion',         description: 'Read and write Notion pages and databases' },
  { id: 'github',        display_name: 'GitHub',         description: 'Manage repositories, issues, and pull requests' },
  { id: 'openai',        display_name: 'OpenAI',         description: 'Direct access to OpenAI models and DALL-E' },
]

const ENV_KEY_MAP: Record<string, string> = {
  elevenlabs:   'ELEVENLABS_API_KEY',
  'gemini-image': 'GEMINI_API_KEY',
  youtube:      'YOUTUBE_API_KEY',
  slack:        'SLACK_BOT_TOKEN',
  notion:       'NOTION_API_KEY',
  github:       'GITHUB_TOKEN',
  openai:       'OPENAI_API_KEY',
}

let _envFilePath = ''
export function setPluginsEnvFilePath(p: string) { _envFilePath = p }

function readEnv(): Record<string, string> {
  if (!_envFilePath || !fs.existsSync(_envFilePath)) return {}
  const lines = fs.readFileSync(_envFilePath, 'utf-8').split('\n')
  const result: Record<string, string> = {}
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return result
}

function writeEnvKey(key: string, value: string) {
  if (!_envFilePath) return
  let content = fs.existsSync(_envFilePath) ? fs.readFileSync(_envFilePath, 'utf-8') : ''
  const regex = new RegExp(`^${key}=.*$`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }
  fs.writeFileSync(_envFilePath, content)
  process.env[key] = value
}

/** Seed built-in plugin rows once on startup */
export function seedBuiltInPlugins() {
  const db = getDb()
  const env = readEnv()
  for (const plugin of BUILT_IN_PLUGINS) {
    const envKey = ENV_KEY_MAP[plugin.id]
    const isConfigured = envKey ? !!env[envKey] : 0
    db.prepare(`
      INSERT OR IGNORE INTO plugins (id, display_name, description, configured)
      VALUES (?, ?, ?, ?)
    `).run(plugin.id, plugin.display_name, plugin.description, isConfigured ? 1 : 0)
    // Sync configured status in case key was added externally
    if (envKey && isConfigured) {
      db.prepare('UPDATE plugins SET configured = 1 WHERE id = ?').run(plugin.id)
    }
  }
}

export function createPluginsRouter(): Router {
  const router = Router()

  // GET /api/plugins
  router.get('/', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM plugins ORDER BY id ASC').all() as PluginRow[]
    const env = readEnv()
    res.json(rows.map(row => ({
      ...row,
      configured: row.configured === 1,
      envKey: ENV_KEY_MAP[row.id] ?? null,
      // Mask the actual key value for security — just show whether it's present
      hasKey: !!(ENV_KEY_MAP[row.id] && env[ENV_KEY_MAP[row.id]]),
    })))
  })

  // POST /api/plugins/:id/configure  — body: { apiKey: string }
  router.post('/:id/configure', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(req.params.id) as PluginRow | undefined
    if (!row) return res.status(404).json({ error: 'Plugin not found' })

    const { apiKey } = req.body as { apiKey?: string }
    if (!apiKey?.trim()) return res.status(400).json({ error: '"apiKey" required' })

    const envKey = ENV_KEY_MAP[row.id]
    if (!envKey) return res.status(422).json({ error: `Plugin "${row.id}" does not use an API key` })

    writeEnvKey(envKey, apiKey.trim())
    db.prepare('UPDATE plugins SET configured = 1 WHERE id = ?').run(row.id)

    eventBus.emit({ type: 'plugin:configured', pluginId: row.id })
    res.json({ ok: true })
  })

  // DELETE /api/plugins/:id/configure — remove the key
  router.delete('/:id/configure', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(req.params.id) as PluginRow | undefined
    if (!row) return res.status(404).json({ error: 'Plugin not found' })

    const envKey = ENV_KEY_MAP[row.id]
    if (envKey && _envFilePath && fs.existsSync(_envFilePath)) {
      let content = fs.readFileSync(_envFilePath, 'utf-8')
      content = content.replace(new RegExp(`^${envKey}=.*\\n?`, 'm'), '')
      fs.writeFileSync(_envFilePath, content)
      delete process.env[envKey]
    }

    db.prepare('UPDATE plugins SET configured = 0 WHERE id = ?').run(row.id)
    res.json({ ok: true })
  })

  return router
}
