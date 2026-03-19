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

  // ─── Memory ───────────────────────────────────────────────────────────────

  memory: {
    list:   (agentId: string) => req<MemoryEntry[]>('GET', `/agents/${agentId}/memory`),
    create: (agentId: string, content: string) =>
      req<MemoryEntry>('POST', `/agents/${agentId}/memory`, { content }),
    update: (agentId: string, id: number, content: string) =>
      req<MemoryEntry>('PUT', `/agents/${agentId}/memory/${id}`, { content }),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/memory/${id}`),
  },

  // ─── Todos ────────────────────────────────────────────────────────────────

  todos: {
    list:   (agentId: string) => req<TodoItem[]>('GET', `/agents/${agentId}/todos`),
    create: (agentId: string, text: string) =>
      req<TodoItem>('POST', `/agents/${agentId}/todos`, { text }),
    patch:  (agentId: string, id: number, data: { completed?: boolean; text?: string }) =>
      req<TodoItem>('PATCH', `/agents/${agentId}/todos/${id}`, data),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/todos/${id}`),
  },

  // ─── Schedules ────────────────────────────────────────────────────────────

  schedules: {
    list:   (agentId: string) => req<Schedule[]>('GET', `/agents/${agentId}/schedules`),
    create: (agentId: string, data: { cron: string; prompt: string; label?: string }) =>
      req<Schedule>('POST', `/agents/${agentId}/schedules`, data),
    patch:  (agentId: string, id: number, data: Partial<Pick<Schedule, 'cron' | 'prompt' | 'label' | 'enabled'>>) =>
      req<Schedule>('PATCH', `/agents/${agentId}/schedules/${id}`, data),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/schedules/${id}`),
  },

  // ─── Workspace ────────────────────────────────────────────────────────────

  workspace: {
    list: () => req<FileEntry[]>('GET', '/workspace'),
    downloadUrl: (filePath: string) => `${BASE}/workspace/download?path=${encodeURIComponent(filePath)}`,
    upload: (file: File, agentId?: string) => {
      const fd = new FormData()
      fd.append('file', file)
      const url = agentId
        ? `${BASE}/workspace/upload?agentId=${encodeURIComponent(agentId)}`
        : `${BASE}/workspace/upload`
      return fetch(url, { method: 'POST', body: fd }).then((r) => {
        if (!r.ok) throw new Error('Upload failed')
        return r.json() as Promise<FileEntry>
      })
    },
    delete: (filePath: string) =>
      req<{ ok: boolean }>('DELETE', `/workspace?path=${encodeURIComponent(filePath)}`),
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

export interface MemoryEntry {
  id: number
  agent_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TodoItem {
  id: number
  agent_id: string
  text: string
  completed: number
  completed_at: string | null
  created_at: string
}

export interface Schedule {
  id: number
  agent_id: string
  cron: string
  prompt: string
  label: string
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface FileEntry {
  path: string
  name: string
  size_bytes: number
  mime_type: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}
