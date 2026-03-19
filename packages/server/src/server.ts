import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import path from 'path'
import fs from 'fs'
import { initWss, broadcast } from './ws.js'
import { eventBus } from './event-bus.js'
import { createSettingsRouter } from './api/settings.js'
import { createAgentsRouter } from './api/agents.js'
import { createChatRouter } from './api/chat.js'
import { createMemoryRouter } from './api/memory.js'
import { createTodosRouter } from './api/todos.js'
import { createSchedulesRouter } from './api/schedules.js'
import { createWorkspaceRouter } from './api/workspace.js'
import { createPluginsRouter } from './api/plugins.js'
import { createUsersRouter, createSetupRouter } from './api/users.js'
import { createRolesRouter } from './api/roles.js'
import { createBoardsRouter } from './api/boards.js'
import { createChannelsRouter } from './api/channels.js'

export function createApp(opts: { webDistDir?: string; workspaceDir?: string } = {}) {
  const app = express()

  app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  // ── Auth + setup ────────────────────────────────────────────────────────────
  app.use('/api/setup', createSetupRouter())
  app.use('/api/users', createUsersRouter())

  // ── Core platform ───────────────────────────────────────────────────────────
  app.use('/api/settings', createSettingsRouter())
  app.use('/api/agents', createAgentsRouter())
  app.use('/api/agents', createChatRouter())
  app.use('/api/agents', createMemoryRouter())
  app.use('/api/agents', createTodosRouter())
  app.use('/api/agents', createSchedulesRouter())
  app.use('/api/workspace', createWorkspaceRouter(opts.workspaceDir ?? process.cwd()))
  app.use('/api/plugins', createPluginsRouter())

  // ── New platform primitives ─────────────────────────────────────────────────
  app.use('/api/roles', createRolesRouter())
  app.use('/api/boards', createBoardsRouter())
  app.use('/api/channels', createChannelsRouter())

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

export function startServer(port: number, webDistDir?: string, workspaceDir?: string) {
  const app = createApp({ webDistDir, workspaceDir })
  const server = createServer(app)
  initWss(server)
  eventBus.on((event) => broadcast(event))

  server.listen(port, () => {
    console.log(`  Server running at http://localhost:${port}`)
  })

  return server
}
