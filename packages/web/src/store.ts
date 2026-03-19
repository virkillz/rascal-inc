import { create } from 'zustand'
import { api, type Agent, type Settings, type Provider } from './api.ts'

interface AppState {
  // Settings
  settings: Settings | null
  providers: Provider[]
  loadSettings: () => Promise<void>
  updateSettings: (data: Partial<Omit<Settings, 'firstRun'>>) => Promise<void>
  loadProviders: () => Promise<void>

  // Agents
  agents: Agent[]
  loadAgents: () => Promise<void>
  addAgent: (data: Parameters<typeof api.agents.create>[0]) => Promise<Agent>
  updateAgent: (id: string, data: Parameters<typeof api.agents.update>[1]) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  settings: null,
  providers: [],
  agents: [],

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
  },

  updateSettings: async (data) => {
    await api.settings.update(data)
    await get().loadSettings()
  },

  loadProviders: async () => {
    const providers = await api.settings.providers()
    set({ providers })
  },

  loadAgents: async () => {
    const agents = await api.agents.list()
    set({ agents })
  },

  addAgent: async (data) => {
    const agent = await api.agents.create(data)
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgent: async (id, data) => {
    const agent = await api.agents.update(id, data)
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? agent : a)) }))
    return agent
  },

  deleteAgent: async (id) => {
    await api.agents.delete(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },
}))
