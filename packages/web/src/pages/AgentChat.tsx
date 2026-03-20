import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { api, type ChatMessage, type Agent, type MemoryEntry, type TodoItem, type Schedule, type Skill } from '../api.ts'

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

type Tab = 'chat' | 'profile' | 'model' | 'memory' | 'todos' | 'schedule' | 'skills'

const TAB_LABELS: Record<Tab, string> = {
  chat: 'Chat',
  profile: 'Profile',
  model: 'Model',
  memory: 'Memory',
  todos: 'Todos',
  schedule: 'Schedule',
  skills: 'Skills',
}

export default function AgentChat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, updateAgent } = useStore()
  const agent = agents.find((a) => a.id === id)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!id) return
    api.chat.history(id).then(setMessages).catch(() => {})
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

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

  async function send() {
    if (!input.trim() || sending || !id) return
    const msg = input.trim()
    setInput('')
    setSending(true)
    setError('')

    const userMsg: ChatMessage = {
      id: Date.now(),
      agent_id: id,
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const { reply } = await api.chat.send(id, msg)
      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        agent_id: id,
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function clearHistory() {
    if (!id) return
    await api.chat.clear(id)
    setMessages([])
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            background: 'rgba(8, 18, 40, 0.72)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: agent.avatar_color + '33', border: `1px solid ${agent.avatar_color}66`, color: agent.avatar_color }}
          >
            {agent.avatar_url
              ? <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
              : agent.name[0].toUpperCase()
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</div>
            <div className="text-xs text-muted">{agent.role}</div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === t ? 'bg-white/[0.12]' : 'hover:bg-white/5'
                }`}
                style={{ color: tab === t ? 'var(--text-primary)' : 'var(--muted)' }}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          {messages.length > 0 && tab === 'chat' && (
            <button className="btn-ghost text-xs" onClick={clearHistory}>
              Clear
            </button>
          )}
        </div>

        {tab === 'chat' ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && !sending && (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 bg-gray-900/80 backdrop-blur-md rounded-md">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4 overflow-hidden"
                    style={{ backgroundColor: agent.avatar_color + '22', border: `1px solid ${agent.avatar_color}44`, color: agent.avatar_color }}
                  >
                    {agent.avatar_url
                      ? <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                      : agent.name[0].toUpperCase()
                    }
                  </div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Chat with {agent.name}</div>
                  <div className="text-xs text-muted max-w-xs">
                    {agent.description || `${agent.name} is ready to help. Send a message to start.`}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} agentName={agent.name} agentColor={agent.avatar_color} agentAvatarUrl={agent.avatar_url} />
              ))}

              {sending && (
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 overflow-hidden"
                    style={{ backgroundColor: agent.avatar_color + '33', color: agent.avatar_color }}
                  >
                    {agent.avatar_url
                      ? <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                      : agent.name[0].toUpperCase()
                    }
                  </div>
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-3"
                    style={{ background: 'rgba(30,50,90,0.90)', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    <div className="flex gap-1 items-center h-4">
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0ms]" style={{ background: 'var(--muted)' }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]" style={{ background: 'var(--muted)' }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]" style={{ background: 'var(--muted)' }} />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-6 pb-6 pt-2">
              <div
                className="flex items-end gap-3 rounded-xl px-4 py-3 transition-colors focus-within:ring-1 focus-within:ring-accent/40"
                style={{ background: 'rgba(8,18,40,0.75)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
              >
                <textarea
                  ref={inputRef}
                  className="flex-1 bg-transparent text-sm placeholder-muted resize-none outline-none max-h-32 min-h-[20px]"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder={`Message ${agent.name}...`}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  autoFocus
                />
                <button
                  className="flex-shrink-0 w-8 h-8 bg-accent hover:bg-accent-dim rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                  onClick={send}
                  disabled={!input.trim() || sending}
                >
                  <SendIcon />
                </button>
              </div>
              <p className="text-[10px] text-muted mt-2 text-center">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        ) : tab === 'profile' ? (
          <ProfileTab agent={agent} onSave={(data) => updateAgent(agent.id, data)} />
        ) : tab === 'model' ? (
          <ModelTab agent={agent} onSave={(data) => updateAgent(agent.id, data)} />
        ) : tab === 'memory' ? (
          <MemoryTab agentId={agent.id} />
        ) : tab === 'todos' ? (
          <TodosTab agentId={agent.id} />
        ) : tab === 'schedule' ? (
          <ScheduleTab agentId={agent.id} />
        ) : (
          <SkillsTab agent={agent} onSave={(data) => updateAgent(agent.id, data)} />
        )}
      </div>
    </div>
  )
}

// ─── Memory Tab ───────────────────────────────────────────────────────────────

function MemoryTab({ agentId }: { agentId: string }) {
  const { memory, loadMemory, addMemory, updateMemory, deleteMemory } = useStore()
  const entries = memory[agentId] ?? []
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadMemory(agentId) }, [agentId, loadMemory])

  async function handleAdd() {
    if (!newContent.trim()) return
    setAdding(true)
    try {
      await addMemory(agentId, newContent.trim())
      setNewContent('')
    } finally { setAdding(false) }
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
          Memory entries are injected into {`this agent's`} system prompt and persist across sessions.
        </p>

        {/* Add new */}
        <div className="flex gap-2 mb-6">
          <textarea
            className="input flex-1 resize-none text-sm"
            rows={2}
            placeholder="Add a memory entry..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
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
            <div key={entry.id} className="rounded-lg px-3 py-2.5 group" style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}>
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
                    <button className="btn-primary text-xs px-2 py-1" onClick={() => handleUpdate(entry.id)}>Save</button>
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{entry.content}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                      onClick={() => { setEditingId(entry.id); setEditContent(entry.content) }}
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

// ─── Todos Tab ────────────────────────────────────────────────────────────────

function TodosTab({ agentId }: { agentId: string }) {
  const { todos, loadTodos, addTodo, patchTodo, deleteTodo } = useStore()
  const items = todos[agentId] ?? []
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const open = items.filter((t) => !t.completed)
  const done = items.filter((t) => t.completed)

  useEffect(() => { loadTodos(agentId) }, [agentId, loadTodos])

  async function handleAdd() {
    if (!newText.trim()) return
    setAdding(true)
    try {
      await addTodo(agentId, newText.trim())
      setNewText('')
    } finally { setAdding(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        {/* Add new */}
        <div className="flex gap-2 mb-6">
          <input
            className="input flex-1 text-sm"
            placeholder="Add a todo..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          <button
            className="btn-primary px-3 py-2 text-xs"
            onClick={handleAdd}
            disabled={!newText.trim() || adding}
          >
            Add
          </button>
        </div>

        {/* Open todos */}
        {open.length === 0 && done.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No todos yet.</p>
        )}

        <div className="space-y-1.5">
          {open.map((t: TodoItem) => (
            <TodoRow key={t.id} todo={t} agentId={agentId} onPatch={patchTodo} onDelete={deleteTodo} />
          ))}
        </div>

        {/* Completed section */}
        {done.length > 0 && (
          <div className="mt-6">
            <button
              className="flex items-center gap-1.5 text-xs text-muted hover:text-subtle mb-2 transition-colors"
              onClick={() => setShowCompleted((v) => !v)}
            >
              <ChevronIcon rotated={showCompleted} />
              {done.length} completed
            </button>
            {showCompleted && (
              <div className="space-y-1.5 opacity-60">
                {done.map((t: TodoItem) => (
                  <TodoRow key={t.id} todo={t} agentId={agentId} onPatch={patchTodo} onDelete={deleteTodo} />
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
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg group" style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}>
      <button
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          todo.completed
            ? 'bg-accent border-accent'
            : 'border-border hover:border-accent'
        }`}
        onClick={() => onPatch(agentId, todo.id, { completed: !todo.completed })}
      >
        {todo.completed && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span
        className={`flex-1 text-sm ${todo.completed ? 'line-through text-muted' : ''}`}
        style={{ color: todo.completed ? undefined : 'var(--text-primary)' }}
      >
        {todo.text}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-all flex-shrink-0"
        onClick={() => onDelete(agentId, todo.id)}
        title="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
]

function ScheduleTab({ agentId }: { agentId: string }) {
  const { schedules, loadSchedules, addSchedule, patchSchedule, deleteSchedule } = useStore()
  const items = schedules[agentId] ?? []
  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formCron, setFormCron] = useState('0 9 * * *')
  const [formPrompt, setFormPrompt] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSchedules(agentId) }, [agentId, loadSchedules])

  async function handleCreate() {
    setFormError('')
    if (!formCron.trim() || !formPrompt.trim()) {
      setFormError('Cron expression and prompt are required.')
      return
    }
    setSaving(true)
    try {
      await addSchedule(agentId, { cron: formCron, prompt: formPrompt, label: formLabel })
      setShowForm(false)
      setFormLabel('')
      setFormCron('0 9 * * *')
      setFormPrompt('')
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create schedule')
    } finally { setSaving(false) }
  }

  function formatNextRun(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-2xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted">Recurring tasks that run automatically on a schedule.</p>
          <button className="btn-primary text-xs px-3 py-1.5" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add schedule'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="rounded-xl p-4 mb-6 space-y-3 animate-zoom-in" style={{ background: 'rgba(8,18,40,0.80)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
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
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button className="btn-primary text-xs" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create schedule'}
            </button>
          </div>
        )}

        {/* Schedule list */}
        {items.length === 0 && !showForm && (
          <p className="text-sm text-muted text-center py-8">No schedules yet.</p>
        )}

        <div className="space-y-2">
          {items.map((s: Schedule) => (
            <div key={s.id} className="rounded-lg px-4 py-3" style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {s.label && (
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                    )}
                    <code className="text-[10px] bg-white/[0.07] px-1.5 py-0.5 rounded font-mono text-subtle">
                      {s.cron}
                    </code>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.enabled ? 'bg-green-500/15 text-green-400' : 'bg-white/[0.07] text-muted'}`}>
                      {s.enabled ? 'enabled' : 'paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted truncate">{s.prompt}</p>
                  <p className="text-[10px] text-muted mt-1">Next: {formatNextRun(s.next_run_at)}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors text-xs"
                    onClick={() => patchSchedule(agentId, s.id, { enabled: s.enabled ? 0 : 1 })}
                    title={s.enabled ? 'Pause' : 'Enable'}
                  >
                    {s.enabled ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-colors"
                    onClick={() => deleteSchedule(agentId, s.id)}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ agent, onSave }: { agent: Agent; onSave: (data: Partial<Agent & { systemPrompt: string }>) => Promise<unknown> }) {
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
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short bio for the roster card..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">System prompt</label>
            <textarea
              className="input resize-none h-48 font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="How should this agent behave?"
            />
            <p className="text-[10px] text-muted mt-1">Changes take effect on the next message. Current session will reset.</p>
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

// ─── Model Tab ────────────────────────────────────────────────────────────────

function ModelTab({ agent, onSave }: { agent: Agent; onSave: (data: { modelConfig: object }) => Promise<unknown> }) {
  const { settings, providers, loadProviders } = useStore()
  const hasCustom = !!(agent.modelConfig?.provider || agent.modelConfig?.modelId)

  const [useCustom, setUseCustom] = useState(hasCustom)
  const [provider, setProvider] = useState(agent.modelConfig?.provider ?? settings?.defaultModel?.provider ?? 'openrouter')
  const [modelId, setModelId] = useState(agent.modelConfig?.modelId ?? settings?.defaultModel?.modelId ?? '')
  const [thinkingLevel, setThinkingLevel] = useState(agent.modelConfig?.thinkingLevel ?? settings?.defaultModel?.thinkingLevel ?? 'low')
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
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>AI Model</p>
            <p className="text-xs text-muted">
              Override the default model for this agent. Default: <span className="text-subtle">{defaultLabel}</span>
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${useCustom ? 'bg-accent' : 'bg-white/[0.07]'}`}
              onClick={() => setUseCustom((v) => !v)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useCustom ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Use custom model</span>
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
                      {p.label}{p.configured ? '' : ' (not configured)'}
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
                    onChange={(e) => { setModelId(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Enter or select a model ID..."
                  />
                  {open && (PROVIDER_MODELS[provider] ?? []).length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10" style={{ background: 'rgba(8,18,40,0.92)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                      {(PROVIDER_MODELS[provider] ?? [])
                        .filter((s) => s.toLowerCase().includes(modelId.toLowerCase()))
                        .map((s) => (
                          <button
                            key={s}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.07] transition-colors"
                            style={{ color: 'var(--text-primary)' }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setModelId(s); setOpen(false) }}
                          >
                            {s}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Thinking level</label>
                <select className="input" value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
                  {THINKING_LEVELS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
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

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab({ agent, onSave }: { agent: Agent; onSave: (data: { modelConfig: object }) => Promise<unknown> }) {
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
        // Disable: build an allowlist of everything except this skill
        const all = skills.map((s) => s.name)
        next = all.filter((n) => n !== skillName)
        if (next.length === 0) next = undefined // no skills = same as all disabled, keep undefined to signal "none"
      } else {
        // Enable: add back to allowlist (or clear it if all enabled now)
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
          <a href="/skills" className="text-accent hover:underline">Skills page</a>.
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
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{skill.name}</div>
                  {skill.description && (
                    <p className="text-xs text-muted truncate">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => toggle(skill.name, enabled)}
                  disabled={saving === skill.name}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-white/[0.07]'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, agentName, agentColor, agentAvatarUrl }: {
  msg: ChatMessage
  agentName: string
  agentColor: string
  agentAvatarUrl?: string
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-3" style={{ background: 'rgba(245,158,11,0.28)', border: '1px solid rgba(245,158,11,0.55)' }}>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 overflow-hidden"
        style={{ backgroundColor: agentColor + '33', color: agentColor }}
      >
        {agentAvatarUrl
          ? <img src={agentAvatarUrl} alt={agentName} className="w-full h-full object-cover" />
          : agentName[0].toUpperCase()
        }
      </div>
      <div
        className="max-w-[70%] rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ background: 'rgba(30,50,90,0.90)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  )
}

function ChevronIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${rotated ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}
