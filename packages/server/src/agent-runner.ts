import { getModel } from '@mariozechner/pi-ai'
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  SessionManager,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent'
import path from 'path'
import { getAgentMemory, getAgentTodos } from './db.js'
import { eventBus } from './event-bus.js'

export interface ModelConfig {
  provider: string
  modelId: string
  thinkingLevel?: string
}

export interface AgentRecord {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
}

interface LiveSession {
  session: Awaited<ReturnType<typeof createAgentSession>>['session']
  unsubscribe: (() => void) | null
}

// One persistent session per agent, keyed by agent ID.
const liveSessions = new Map<string, LiveSession>()

// Pending resolve callbacks for in-flight chat requests.
const pending = new Map<string, { chunks: string[]; resolve: (text: string) => void }>()

let dataDir = process.cwd()

export function setDataDir(dir: string): void {
  dataDir = dir
}

function buildSystemPrompt(agent: AgentRecord): string {
  const base = agent.system_prompt.trim()
  const header = `You are ${agent.name}, ${agent.role} at this company.`

  const memories = getAgentMemory(agent.id)
  const todos = getAgentTodos(agent.id, true)

  const memoryBlock = memories.length
    ? `## Your Memory\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : ''
  const todoBlock = todos.length
    ? `## Your Open Todos\n${todos.map((t) => `- [ ] ${t.text}`).join('\n')}`
    : ''

  return [header, base, memoryBlock, todoBlock].filter(Boolean).join('\n\n')
}

function resolveModelConfig(modelConfigJson: string, defaultConfig: ModelConfig): ModelConfig {
  try {
    const parsed = JSON.parse(modelConfigJson)
    return { ...defaultConfig, ...parsed }
  } catch {
    return defaultConfig
  }
}

async function createLiveSession(agent: AgentRecord, defaultModel: ModelConfig): Promise<LiveSession> {
  const config = resolveModelConfig(agent.model_config, defaultModel)

  const model = getModel(config.provider as Parameters<typeof getModel>[0], config.modelId)
  if (!model) throw new Error(`Model not found: ${config.provider}/${config.modelId}`)

  const systemPrompt = buildSystemPrompt(agent)
  const sessionsDir = path.join(dataDir, 'sessions', agent.id)

  const loader = new DefaultResourceLoader({
    cwd: dataDir,
    systemPromptOverride: () => systemPrompt,
  })
  await loader.reload()

  const { session } = await createAgentSession({
    cwd: dataDir,
    model,
    thinkingLevel: (config.thinkingLevel ?? 'low') as Parameters<typeof createAgentSession>[0]['thinkingLevel'],
    authStorage: AuthStorage.create(),
    modelRegistry: new ModelRegistry(AuthStorage.create()),
    resourceLoader: loader,
    customTools: [],
    sessionManager: SessionManager.create(dataDir, sessionsDir),
  })

  const liveSession: LiveSession = { session, unsubscribe: null }

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    const p = pending.get(agent.id)
    if (!p) return
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      const delta = event.assistantMessageEvent.delta
      p.chunks.push(delta)
      if (p.chunks.length === 1) {
        eventBus.emit({ type: 'agent:reply', agentId: agent.id, preview: delta.slice(0, 80) })
      }
    }
  })

  // Pi SDK subscribe may or may not return an unsubscribe fn
  liveSession.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null

  return liveSession
}

export async function chatWithAgent(
  agent: AgentRecord,
  message: string,
  defaultModel: ModelConfig,
): Promise<string> {
  if (!liveSessions.has(agent.id)) {
    const live = await createLiveSession(agent, defaultModel)
    liveSessions.set(agent.id, live)
  }

  const live = liveSessions.get(agent.id)!

  eventBus.emit({ type: 'agent:thinking', agentId: agent.id })

  return new Promise((resolve, reject) => {
    pending.set(agent.id, { chunks: [], resolve })

    live.session.prompt(message)
      .then(() => live.session.agent.waitForIdle())
      .then(() => {
        const p = pending.get(agent.id)
        pending.delete(agent.id)
        const text = p?.chunks.join('') ?? ''
        eventBus.emit({ type: 'agent:idle', agentId: agent.id })
        resolve(text)
      })
      .catch((err: unknown) => {
        pending.delete(agent.id)
        liveSessions.delete(agent.id)
        const msg = err instanceof Error ? err.message : String(err)
        eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
        reject(err)
      })
  })
}

export function clearSession(agentId: string): void {
  const live = liveSessions.get(agentId)
  if (live?.unsubscribe) live.unsubscribe()
  liveSessions.delete(agentId)
}
