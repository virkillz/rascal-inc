const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  firstRun: boolean
  companyName: string
  companyMission: string
  defaultModel: { provider: string; modelId: string; thinkingLevel: string }
}

export interface Provider {
  id: string
  label: string
  envKey: string
  recommended: boolean
  configured: boolean
  defaultModel: string
}

export const api = {
  settings: {
    get: () => req<Settings>('GET', '/settings'),
    update: (data: Partial<Omit<Settings, 'firstRun'>>) => req<{ ok: boolean }>('POST', '/settings', data),
    providers: () => req<Provider[]>('GET', '/settings/providers'),
    saveProviderKey: (id: string, apiKey: string) =>
      req<{ ok: boolean }>('POST', `/settings/providers/${id}`, { apiKey }),
    removeProviderKey: (id: string) =>
      req<{ ok: boolean }>('DELETE', `/settings/providers/${id}`),
    testProvider: (id: string) =>
      req<{ ok: boolean; error?: string }>('POST', `/settings/providers/${id}/test`),
  },

  // ─── Agents ───────────────────────────────────────────────────────────────

  agents: {
    list: () => req<Agent[]>('GET', '/agents'),
    get: (id: string) => req<Agent>('GET', `/agents/${id}`),
    create: (data: CreateAgentInput) => req<Agent>('POST', '/agents', data),
    update: (id: string, data: Partial<CreateAgentInput>) => req<Agent>('PUT', `/agents/${id}`, data),
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/agents/${id}`),
  },

  // ─── Chat ─────────────────────────────────────────────────────────────────

  chat: {
    history: (agentId: string) => req<ChatMessage[]>('GET', `/agents/${agentId}/chat`),
    send: (agentId: string, message: string) =>
      req<{ reply: string }>('POST', `/agents/${agentId}/chat`, { message }),
    clear: (agentId: string) => req<{ ok: boolean }>('DELETE', `/agents/${agentId}/chat`),
  },
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
  modelConfig: { provider?: string; modelId?: string; thinkingLevel?: string }
  source: string
  avatar_color: string
  created_at: string
  updated_at: string
}

export interface CreateAgentInput {
  name: string
  role: string
  description?: string
  systemPrompt?: string
  modelConfig?: { provider?: string; modelId?: string; thinkingLevel?: string }
}

export interface ChatMessage {
  id: number
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
