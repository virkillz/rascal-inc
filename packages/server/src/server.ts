import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import path from 'path'
import fs from 'fs'
import { initWss } from './ws.js'
import { createSettingsRouter } from './api/settings.js'
import { createAgentsRouter } from './api/agents.js'
import { createChatRouter } from './api/chat.js'

export function createApp(opts: { webDistDir?: string } = {}) {
  const app = express()

  app.use(cors({ origin: 'http://localhost:5173' }))
  app.use(express.json())

  app.use('/api/settings', createSettingsRouter())
  app.use('/api/agents', createAgentsRouter())
  app.use('/api/agents', createChatRouter())

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // Serve built web app in production
  if (opts.webDistDir && fs.existsSync(opts.webDistDir)) {
    app.use(express.static(opts.webDistDir))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(opts.webDistDir!, 'index.html'))
    })
  }

  return app
}

export function startServer(port: number, webDistDir?: string) {
  const app = createApp({ webDistDir })
  const server = createServer(app)
  initWss(server)

  server.listen(port, () => {
    console.log(`  Server running at http://localhost:${port}`)
  })

  return server
}
