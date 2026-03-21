import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { api, type Agent, type MemoryEntry, type TodoItem, type Schedule, type Skill, type Plugin as ApiPlugin } from '../api.ts'

const PROVIDER_MODELS: Record<string, string[]> = {
  openrouter: [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-3-5-haiku',
    'anthropic/claude-opus-4-6',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  anthropic: ['claude-sonnet-4-6', 'claude-3-5-haiku-20241022', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  google: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  xai: ['grok-3-fast', 'grok-3', 'grok-2'],
  'github-copilot': ['claude-sonnet-4-5', 'gpt-4o'],
}

const THINKING_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const CRON_PRESETS = [
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
]

type Section = 'profile' | 'model' | 'memory' | 'todos' | 'skills' | 'plugins' | 'schedule' | 'prompt' | 'terminate'

const NAV_ITEMS: { id: Section; label: string; danger?: boolean }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'model', label: 'Model' },
  { id: 'memory', label: 'Memory' },
  { id: 'todos', label: 'Todos' },
  { id: 'skills', label: 'Skills' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'prompt', label: 'System Prompt' },
  { id: 'terminate', label: 'Terminate', danger: true },
]

export default function AgentSettings() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, updateAgent, toggleAgentActive } = useStore()
  const agent = agents.find((a) => a.id === id)
  const [section, setSection] = useState<Section>('profile')

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Agent not found.{' '}
        <button className="text-accent ml-1 hover:underline" onClick={() => navigate('/roster')}>
          Back to roster
        </button>
      </div>
    )
  }

  async function handleSave(data: Parameters<typeof updateAgent>[1] & { systemPrompt?: string }) {
    if (!id) return
    const { systemPrompt, ...rest } = data
    await updateAgent(id, { ...rest, ...(systemPrompt !== undefined ? { systemPrompt } : {}) })
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className="w-52 flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(8,18,40,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Back + agent header */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-subtle mb-4 transition-colors"
            onClick={() => navigate(`/agents/${id}`)}
          >
            <ChevronLeftIcon />
            Back to chat
          </button>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
              style={{
                backgroundColor: agent.avatar_color + '33',
                border: `1px solid ${agent.avatar_color}66`,
                color: agent.avatar_color,
              }}
            >
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
              ) : (
                agent.name[0].toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {agent.name}
              </div>
              <div className="text-[10px] text-muted truncate">{agent.role}</div>
            </div>
          </div>

          {/* is_active toggle */}
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
            onClick={() => id && toggleAgentActive(id)}
            title={agent.is_active ? 'Deactivate agent' : 'Activate agent'}
          >
            <div
              className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                agent.is_active ? 'bg-accent' : 'bg-white/[0.10]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                  agent.is_active ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span style={{ color: agent.is_active ? 'var(--text-primary)' : 'var(--muted)' }}>
              {agent.is_active ? 'Active' : 'Inactive'}
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          <div className="flex-1">
            {NAV_ITEMS.filter(i => !i.danger).map(({ id: navId, label }) => (
              <button
                key={navId}
                onClick={() => setSection(navId)}
                className="w-full flex items-center px-4 py-2 text-sm font-medium transition-all"
                style={{
                  color: section === navId ? 'var(--text-primary)' : 'var(--subtle)',
                  background: section === navId ? 'rgba(245,158,11,0.08)' : undefined,
                  borderLeft: `2px solid ${section === navId ? 'rgb(var(--accent))' : 'transparent'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!agent.is_default && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-1 pb-2">
              <button
                onClick={() => setSection('terminate')}
                className="w-full flex items-center px-4 py-2 text-sm font-medium transition-all"
                style={{
                  color: section === 'terminate' ? 'var(--status-red)' : 'rgba(239,68,68,0.5)',
                  background: section === 'terminate' ? 'rgba(239,68,68,0.08)' : undefined,
                  borderLeft: `2px solid ${section === 'terminate' ? 'var(--status-red)' : 'transparent'}`,
                }}
              >
                Terminate
              </button>
            </div>
          )}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {section === 'profile' && <ProfileSection agent={agent} onSave={handleSave} />}
        {section === 'model' && <ModelSection agent={agent} onSave={handleSave} />}
        {section === 'memory' && id && <MemorySection agentId={id} />}
        {section === 'todos' && id && <TodosSection agentId={id} />}
        {section === 'skills' && <SkillsSection agent={agent} onSave={handleSave} />}
        {section === 'plugins' && <PluginsSection agent={agent} onSave={handleSave} />}
        {section === 'schedule' && id && <ScheduleSection agentId={id} />}
        {section === 'prompt' && id && <PromptSection agentId={id} />}
        {section === 'terminate' && id && <TerminateSection agent={agent} agentId={id} />}
      </div>
    </div>
  )
}

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: Partial<Agent & { systemPrompt: string }>) => Promise<unknown>
}) {
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role)
  const [description, setDescription] = useState(agent.description)
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ name, role, description, systemPrompt })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Role</label>
              <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Description</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short bio for the roster card..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">System prompt</label>
            <textarea
              className="input resize-none h-48 font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="How should this agent behave?"
            />
            <p className="text-[10px] text-muted mt-1">
              Changes take effect on the next message. Current session will reset.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Model Section ────────────────────────────────────────────────────────────

function ModelSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const { settings, providers, loadProviders } = useStore()
  const hasCustom = !!(agent.modelConfig?.provider || agent.modelConfig?.modelId)

  const [useCustom, setUseCustom] = useState(hasCustom)
  const [provider, setProvider] = useState(
    agent.modelConfig?.provider ?? settings?.defaultModel?.provider ?? 'openrouter'
  )
  const [modelId, setModelId] = useState(
    agent.modelConfig?.modelId ?? settings?.defaultModel?.modelId ?? ''
  )
  const [thinkingLevel, setThinkingLevel] = useState(
    agent.modelConfig?.thinkingLevel ?? settings?.defaultModel?.thinkingLevel ?? 'low'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  function handleProviderChange(p: string) {
    setProvider(p)
    const suggestions = PROVIDER_MODELS[p]
    if (suggestions?.length) setModelId(suggestions[0])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const modelConfig = useCustom ? { provider, modelId, thinkingLevel } : {}
      await onSave({ modelConfig })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const defaultLabel = settings?.defaultModel
    ? `${settings.defaultModel.provider} / ${settings.defaultModel.modelId}`
    : 'Not configured'

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              AI Model
            </p>
            <p className="text-xs text-muted">
              Override the default model for this agent. Default:{' '}
              <span className="text-subtle">{defaultLabel}</span>
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${useCustom ? 'bg-accent' : 'bg-white/[0.07]'}`}
              onClick={() => setUseCustom((v) => !v)}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useCustom ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Use custom model
            </span>
          </label>

          {useCustom && (
            <div className="space-y-4 pl-4 border-l-2 border-accent/30">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Provider</label>
                <select
                  className="input"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.configured ? '' : ' (not configured)'}
                    </option>
                  ))}
                  {providers.length === 0 && <option value={provider}>{provider}</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Model</label>
                <div className="relative">
                  <input
                    className="input"
                    value={modelId}
                    onChange={(e) => {
                      setModelId(e.target.value)
                      setOpen(true)
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Enter or select a model ID..."
                  />
                  {open && (PROVIDER_MODELS[provider] ?? []).length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
                      style={{
                        background: 'rgba(8,18,40,0.92)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      {(PROVIDER_MODELS[provider] ?? [])
                        .filter((s) => s.toLowerCase().includes(modelId.toLowerCase()))
                        .map((s) => (
                          <button
                            key={s}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.07] transition-colors"
                            style={{ color: 'var(--text-primary)' }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setModelId(s)
                              setOpen(false)
                            }}
                          >
                            {s}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">
                  Thinking level
                </label>
                <select
                  className="input"
                  value={thinkingLevel}
                  onChange={(e) => setThinkingLevel(e.target.value)}
                >
                  {THINKING_LEVELS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Memory Section ───────────────────────────────────────────────────────────

function MemorySection({ agentId }: { agentId: string }) {
  const { memory, loadMemory, addMemory, updateMemory, deleteMemory } = useStore()
  const entries = memory[agentId] ?? []
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadMemory(agentId)
  }, [agentId, loadMemory])

  async function handleAdd() {
    if (!newContent.trim()) return
    setAdding(true)
    try {
      await addMemory(agentId, newContent.trim())
      setNewContent('')
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdate(id: number) {
    if (!editContent.trim()) return
    await updateMemory(agentId, id, editContent.trim())
    setEditingId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-4">
          Memory entries are injected into this agent's system prompt and persist across sessions.
        </p>

        <div className="flex gap-2 mb-6">
          <textarea
            className="input flex-1 resize-none text-sm"
            rows={2}
            placeholder="Add a memory entry..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          <button
            className="btn-primary self-end px-3 py-2 text-xs"
            onClick={handleAdd}
            disabled={!newContent.trim() || adding}
          >
            Add
          </button>
        </div>

        {entries.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No memory entries yet.</p>
        )}

        <div className="space-y-2">
          {entries.map((entry: MemoryEntry) => (
            <div
              key={entry.id}
              className="rounded-lg px-3 py-2.5 group"
              style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {editingId === entry.id ? (
                <div className="flex gap-2">
                  <textarea
                    className="input flex-1 resize-none text-sm"
                    rows={2}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    autoFocus
                  />
                  <div className="flex flex-col gap-1 self-start">
                    <button
                      className="btn-primary text-xs px-2 py-1"
                      onClick={() => handleUpdate(entry.id)}
                    >
                      Save
                    </button>
                    <button
                      className="btn-ghost text-xs px-2 py-1"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {entry.content}
                  </p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                      onClick={() => {
                        setEditingId(entry.id)
                        setEditContent(entry.content)
                      }}
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-colors"
                      onClick={() => deleteMemory(agentId, entry.id)}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Todos Section ────────────────────────────────────────────────────────────

function TodosSection({ agentId }: { agentId: string }) {
  const { todos, loadTodos, addTodo, patchTodo, deleteTodo } = useStore()
  const items = todos[agentId] ?? []
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const open = items.filter((t) => !t.completed)
  const done = items.filter((t) => t.completed)

  useEffect(() => {
    loadTodos(agentId)
  }, [agentId, loadTodos])

  async function handleAdd() {
    if (!newText.trim()) return
    setAdding(true)
    try {
      await addTodo(agentId, newText.trim())
      setNewText('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="flex gap-2 mb-6">
          <input
            className="input flex-1 text-sm"
            placeholder="Add a todo..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <button
            className="btn-primary px-3 py-2 text-xs"
            onClick={handleAdd}
            disabled={!newText.trim() || adding}
          >
            Add
          </button>
        </div>

        {open.length === 0 && done.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No todos yet.</p>
        )}

        <div className="space-y-1.5">
          {open.map((t: TodoItem) => (
            <TodoRow key={t.id} todo={t} agentId={agentId} onPatch={patchTodo} onDelete={deleteTodo} />
          ))}
        </div>

        {done.length > 0 && (
          <div className="mt-6">
            <button
              className="flex items-center gap-1.5 text-xs text-muted hover:text-subtle mb-2 transition-colors"
              onClick={() => setShowCompleted((v) => !v)}
            >
              <ChevronRightIcon rotated={showCompleted} />
              {done.length} completed
            </button>
            {showCompleted && (
              <div className="space-y-1.5">
                {done.map((t: TodoItem) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    agentId={agentId}
                    onPatch={patchTodo}
                    onDelete={deleteTodo}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TodoRow({
  todo,
  agentId,
  onPatch,
  onDelete,
}: {
  todo: TodoItem
  agentId: string
  onPatch: (agentId: string, id: number, data: { completed?: boolean; text?: string }) => Promise<void>
  onDelete: (agentId: string, id: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)

  async function handleEditSave() {
    if (!editText.trim() || editText.trim() === todo.text) {
      setEditing(false)
      return
    }
    await onPatch(agentId, todo.id, { text: editText.trim() })
    setEditing(false)
  }

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 group"
      style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <button
        className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors"
        style={{
          borderColor: todo.completed ? 'rgb(var(--accent))' : 'rgba(255,255,255,0.25)',
          background: todo.completed ? 'rgba(245,158,11,0.2)' : 'transparent',
        }}
        onClick={() => onPatch(agentId, todo.id, { completed: !todo.completed })}
      >
        {todo.completed && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {editing ? (
        <input
          className="input flex-1 text-sm py-0.5"
          value={editText}
          autoFocus
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleEditSave()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={handleEditSave}
        />
      ) : (
        <span
          className={`flex-1 text-sm ${todo.completed ? 'line-through' : ''}`}
          style={{ color: todo.completed ? 'var(--muted)' : 'var(--text-primary)' }}
        >
          {todo.text}
        </span>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
          onClick={() => {
            setEditText(todo.text)
            setEditing(true)
          }}
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-colors"
          onClick={() => onDelete(agentId, todo.id)}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Skills Section ───────────────────────────────────────────────────────────

function SkillsSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const allowedSkills: string[] | undefined = agent.modelConfig?.allowedSkills

  useEffect(() => {
    api.skills.list().then(setSkills).finally(() => setLoading(false))
  }, [])

  async function toggle(skillName: string, currentlyEnabled: boolean) {
    setSaving(skillName)
    try {
      let next: string[] | undefined
      if (currentlyEnabled) {
        const all = skills.map((s) => s.name)
        next = all.filter((n) => n !== skillName)
        if (next.length === 0) next = undefined
      } else {
        const current = allowedSkills ?? []
        const next_ = [...current, skillName]
        next = next_.length === skills.length ? undefined : next_
      }
      await onSave({ modelConfig: { ...agent.modelConfig, allowedSkills: next } })
    } finally {
      setSaving(null)
    }
  }

  function isEnabled(skillName: string): boolean {
    if (!allowedSkills) return true
    return allowedSkills.includes(skillName)
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-5">
          Control which workspace skills this agent can use. Install new skills from the{' '}
          <a href="/settings/skills" className="text-accent hover:underline">
            Skills page
          </a>
          .
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && skills.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No skills installed yet. Go to the Skills page to install some.
          </div>
        )}

        <div className="space-y-2">
          {skills.map((skill) => {
            const enabled = isEnabled(skill.name)
            return (
              <div
                key={skill.name}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {skill.name}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-muted truncate">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => toggle(skill.name, enabled)}
                  disabled={saving === skill.name}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                    enabled ? 'bg-accent' : 'bg-white/[0.07]'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Plugins Section ──────────────────────────────────────────────────────────

function PluginsSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [plugins, setPlugins] = useState<ApiPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const enabledTools: string[] = agent.modelConfig?.tools ?? []

  useEffect(() => {
    api.plugins.list().then(setPlugins).finally(() => setLoading(false))
  }, [])

  function isEnabled(plugin: ApiPlugin): boolean {
    return plugin.toolIds.length > 0 && plugin.toolIds.every((id) => enabledTools.includes(id))
  }

  async function toggle(plugin: ApiPlugin, currentlyEnabled: boolean) {
    setSaving(plugin.id)
    try {
      let next: string[]
      if (currentlyEnabled) {
        next = enabledTools.filter((id) => !plugin.toolIds.includes(id))
      } else {
        next = [...new Set([...enabledTools, ...plugin.toolIds])]
      }
      await onSave({ modelConfig: { ...agent.modelConfig, tools: next } })
    } finally {
      setSaving(null)
    }
  }

  const configured = plugins.filter((p: ApiPlugin) => p.configured)
  const unconfigured = plugins.filter((p: ApiPlugin) => !p.configured)

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-5">
          Control which plugins this agent can use. Configure plugin API keys from the{' '}
          <a href="/settings/plugins" className="text-accent hover:underline">
            Plugins page
          </a>
          .
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && plugins.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No plugins available.
          </div>
        )}

        {configured.length > 0 && (
          <div className="space-y-2">
            {configured.map((plugin) => {
              const enabled = isEnabled(plugin)
              return (
                <div
                  key={plugin.id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {plugin.display_name}
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-muted truncate">{plugin.description}</p>
                    )}
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                      Tools: {plugin.toolIds.join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle(plugin, enabled)}
                    disabled={saving === plugin.id}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      enabled ? 'bg-accent' : 'bg-white/[0.07]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {unconfigured.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Not configured</p>
            <div className="space-y-2">
              {unconfigured.map((plugin) => (
                <div
                  key={plugin.id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 opacity-40"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {plugin.display_name}
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-muted truncate">{plugin.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted flex-shrink-0">Needs API key</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Schedule Section ─────────────────────────────────────────────────────────

function ScheduleSection({ agentId }: { agentId: string }) {
  const { schedules, loadSchedules, addSchedule, patchSchedule, deleteSchedule } = useStore()
  const items = schedules[agentId] ?? []
  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formCron, setFormCron] = useState('0 9 * * *')
  const [formPrompt, setFormPrompt] = useState('')
  const [formSkipIfNoTodos, setFormSkipIfNoTodos] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // Dropdown menu
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  // Edit schedule
  const [editScheduleId, setEditScheduleId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCron, setEditCron] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editSkipIfNoTodos, setEditSkipIfNoTodos] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Preview prompt modal
  const [previewSchedule, setPreviewSchedule] = useState<Schedule | null>(null)
  const [previewCombinedPrompt, setPreviewCombinedPrompt] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Delete confirmation modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // Run now
  const [runningId, setRunningId] = useState<number | null>(null)

  useEffect(() => {
    loadSchedules(agentId)
  }, [agentId, loadSchedules])

  // Close dropdown on outside click
  useEffect(() => {
    if (openMenuId === null) return
    function handleClick() { setOpenMenuId(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openMenuId])

  function openEdit(s: Schedule) {
    setEditScheduleId(s.id)
    setEditLabel(s.label ?? '')
    setEditCron(s.cron)
    setEditPrompt(s.prompt)
    setEditSkipIfNoTodos(!!s.skip_if_no_todos)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editCron.trim() || !editPrompt.trim()) {
      setEditError('Cron expression and prompt are required.')
      return
    }
    setEditSaving(true)
    try {
      await patchSchedule(agentId, editScheduleId!, {
        label: editLabel,
        cron: editCron,
        prompt: editPrompt,
        skip_if_no_todos: editSkipIfNoTodos ? 1 : 0,
      })
      setEditScheduleId(null)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleRunNow(s: Schedule) {
    setRunningId(s.id)
    try {
      await api.chat.send(agentId, s.prompt)
    } finally {
      setRunningId(null)
    }
  }

  async function handleDeleteConfirm() {
    if (deleteConfirmId === null) return
    await deleteSchedule(agentId, deleteConfirmId)
    setDeleteConfirmId(null)
  }

  async function handleCreate() {
    setFormError('')
    if (!formCron.trim() || !formPrompt.trim()) {
      setFormError('Cron expression and prompt are required.')
      return
    }
    setSaving(true)
    try {
      await addSchedule(agentId, {
        cron: formCron,
        prompt: formPrompt,
        label: formLabel,
        skipIfNoTodos: formSkipIfNoTodos,
      })
      setShowForm(false)
      setFormLabel('')
      setFormCron('0 9 * * *')
      setFormPrompt('')
      setFormSkipIfNoTodos(false)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  function formatNextRun(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-2xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted">Recurring tasks that run automatically on a schedule.</p>
          <button
            className="btn-primary text-xs px-3 py-1.5"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ Add schedule'}
          </button>
        </div>

        {showForm && (
          <div
            className="rounded-xl p-4 mb-6 space-y-3 animate-zoom-in"
            style={{
              background: 'rgba(8,18,40,0.80)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Label (optional)</label>
              <input
                className="input text-sm"
                placeholder="e.g. Morning standup"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Cron expression</label>
              <input
                className="input font-mono text-sm"
                placeholder="0 9 * * *"
                value={formCron}
                onChange={(e) => setFormCron(e.target.value)}
              />
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className="px-2 py-0.5 rounded bg-white/[0.07] text-[10px] text-subtle hover:text-text-primary transition-colors"
                    onClick={() => setFormCron(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Prompt</label>
              <textarea
                className="input resize-none text-sm"
                rows={3}
                placeholder="What should the agent do when this fires?"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                  formSkipIfNoTodos ? 'bg-accent' : 'bg-white/[0.10]'
                }`}
                onClick={() => setFormSkipIfNoTodos((v) => !v)}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    formSkipIfNoTodos ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-xs text-subtle">Skip if no todos</span>
            </label>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button className="btn-primary text-xs" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create schedule'}
            </button>
          </div>
        )}

        {items.length === 0 && !showForm && (
          <p className="text-sm text-muted text-center py-8">No schedules yet.</p>
        )}

        <div className="space-y-2">
          {items.map((s: Schedule) => (
            <div
              key={s.id}
              className="rounded-lg px-4 py-3"
              style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {s.label && (
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </span>
                    )}
                    <code className="text-[10px] bg-white/[0.07] px-1.5 py-0.5 rounded font-mono text-subtle">
                      {s.cron}
                    </code>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        s.enabled
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-white/[0.07] text-muted'
                      }`}
                    >
                      {s.enabled ? 'enabled' : 'paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted truncate">{s.prompt}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-muted">Next: {formatNextRun(s.next_run_at)}</p>
                    <button
                      className="flex items-center gap-1.5 text-[10px] transition-colors"
                      style={{ color: s.skip_if_no_todos ? 'var(--text-primary)' : 'var(--muted)' }}
                      onClick={() =>
                        patchSchedule(agentId, s.id, { skip_if_no_todos: s.skip_if_no_todos ? 0 : 1 })
                      }
                      title="Toggle skip if no todos"
                    >
                      <div
                        className={`w-6 h-3 rounded-full transition-colors relative flex-shrink-0 ${
                          s.skip_if_no_todos ? 'bg-accent' : 'bg-white/[0.10]'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${
                            s.skip_if_no_todos ? 'translate-x-3' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                      Skip if no todos
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 items-center">
                  <button
                    className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors text-xs"
                    onClick={() => patchSchedule(agentId, s.id, { enabled: s.enabled ? 0 : 1 })}
                    title={s.enabled ? 'Pause' : 'Enable'}
                  >
                    {s.enabled ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  {/* Vertical ellipsis dropdown */}
                  <div className="relative">
                    <button
                      className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                      title="More options"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === s.id ? null : s.id)
                      }}
                    >
                      <VerticalEllipsisIcon />
                    </button>
                    {openMenuId === s.id && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-xl"
                        style={{
                          background: 'rgba(15,23,42,0.97)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          backdropFilter: 'blur(16px)',
                          minWidth: '148px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors disabled:opacity-50"
                          disabled={runningId === s.id}
                          onClick={() => { setOpenMenuId(null); handleRunNow(s) }}
                        >
                          <BoltIcon />
                          {runningId === s.id ? 'Running...' : 'Run now'}
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors"
                          onClick={() => { setOpenMenuId(null); openEdit(s) }}
                        >
                          <PencilIcon />
                          Edit
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors"
                          onClick={() => {
                            setOpenMenuId(null)
                            setPreviewSchedule(s)
                            setPreviewCombinedPrompt(null)
                            setPreviewLoading(true)
                            api.agents.previewPrompt(agentId)
                              .then((r) => setPreviewCombinedPrompt(r.prompt))
                              .finally(() => setPreviewLoading(false))
                          }}
                        >
                          <EyeIcon />
                          Preview prompt
                        </button>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-white/[0.07] transition-colors"
                          onClick={() => { setOpenMenuId(null); setDeleteConfirmId(s.id) }}
                        >
                          <TrashIcon />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline edit form */}
              {editScheduleId === s.id && (
                <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Label (optional)</label>
                    <input
                      className="input text-sm"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Cron expression</label>
                    <input
                      className="input font-mono text-sm"
                      value={editCron}
                      onChange={(e) => setEditCron(e.target.value)}
                    />
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          className="px-2 py-0.5 rounded bg-white/[0.07] text-[10px] text-subtle hover:text-text-primary transition-colors"
                          onClick={() => setEditCron(p.value)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Prompt</label>
                    <textarea
                      className="input resize-none text-sm"
                      rows={3}
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <div
                      className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                        editSkipIfNoTodos ? 'bg-accent' : 'bg-white/[0.10]'
                      }`}
                      onClick={() => setEditSkipIfNoTodos((v) => !v)}
                    >
                      <div
                        className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                          editSkipIfNoTodos ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                    <span className="text-xs text-subtle">Skip if no todos</span>
                  </label>
                  {editError && <p className="text-xs text-red-400">{editError}</p>}
                  <div className="flex gap-2">
                    <button className="btn-primary text-xs" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs text-subtle hover:text-text-primary transition-colors"
                      onClick={() => setEditScheduleId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Preview prompt modal */}
    {previewSchedule && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={() => { setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}
      >
        <div
          className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
          style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Combined system prompt
              </h3>
              {previewSchedule.label && (
                <p className="text-xs text-muted mt-0.5">{previewSchedule.label}</p>
              )}
            </div>
            <button
              className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
              onClick={() => { setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}
            >
              <XIcon />
            </button>
          </div>
          <pre
            className="text-xs text-subtle whitespace-pre-wrap break-words rounded-lg p-4 overflow-y-auto max-h-80"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {previewLoading ? 'Loading...' : (previewCombinedPrompt ?? '')}
          </pre>
          <div className="flex justify-end mt-4">
            <button className="btn-primary text-xs px-4 py-1.5" onClick={() => { setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Delete confirmation modal */}
    {deleteConfirmId !== null && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={() => setDeleteConfirmId(null)}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
          style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete schedule?</h3>
          <p className="text-xs text-muted mb-5">This action cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-4 py-1.5 text-xs text-subtle hover:text-text-primary transition-colors"
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              onClick={handleDeleteConfirm}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${rotated ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  )
}

function VerticalEllipsisIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

function PromptSection({ agentId }: { agentId: string }) {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.agents.previewPrompt(agentId)
      .then((r) => setPrompt(r.prompt))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentId])

  function handleCopy() {
    if (!prompt) return
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-3xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Combined System Prompt
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Read-only preview of the full prompt sent to the model at session start.
            </p>
          </div>
          {prompt && (
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>

        {loading && (
          <div className="text-sm text-muted py-8 text-center">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-400 py-4">{error}</div>
        )}
        {prompt && (
          <pre
            className="text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap rounded-xl p-4"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'var(--subtle)',
              fontFamily: 'ui-monospace, monospace',
              maxHeight: '65vh',
              overflowY: 'auto',
            }}
          >
            {prompt}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── Terminate Section ────────────────────────────────────────────────────────

function TerminateSection({ agent, agentId }: { agent: Agent; agentId: string }) {
  const navigate = useNavigate()
  const { deleteAgent } = useStore()
  const [confirmText, setConfirmText] = useState('')
  const [terminating, setTerminating] = useState(false)
  const [error, setError] = useState('')

  async function handleTerminate() {
    if (confirmText !== 'delete') return
    setTerminating(true)
    setError('')
    try {
      await deleteAgent(agentId)
      navigate('/roster')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setTerminating(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div
        className="w-full max-w-xl rounded-2xl p-6 animate-zoom-in"
        style={{
          background: 'rgba(20,8,8,0.90)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <div className="flex items-start gap-4 mb-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <span style={{ color: 'var(--status-red)', fontSize: '18px' }}>⚠</span>
          </div>
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--status-red)' }}>
              Terminate Employee
            </h2>
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>
              This will permanently delete <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</span> and all associated data — memory, todos, schedules, and chat history.
            </p>
            <p className="text-sm mt-2 font-semibold" style={{ color: 'var(--status-red)' }}>
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--subtle)' }}>
            Type <span className="font-bold" style={{ color: 'var(--text-primary)' }}>delete</span> to confirm
          </label>
          <input
            className="input"
            placeholder="delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTerminate()}
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

        <button
          onClick={handleTerminate}
          disabled={confirmText !== 'delete' || terminating}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: confirmText === 'delete' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.06)',
            color: confirmText === 'delete' ? 'var(--status-red)' : 'rgba(239,68,68,0.35)',
            border: `1px solid ${confirmText === 'delete' ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)'}`,
            cursor: confirmText === 'delete' ? 'pointer' : 'not-allowed',
          }}
        >
          {terminating ? 'Terminating...' : 'Terminate Employee'}
        </button>
      </div>
    </div>
  )
}
