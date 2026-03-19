import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { api, type ChatMessage, type Agent } from '../api.ts'

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

export default function AgentChat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, updateAgent } = useStore()
  const agent = agents.find((a) => a.id === id)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'chat' | 'profile' | 'model'>('chat')
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
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-1/50">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: agent.avatar_color + '33', border: `1px solid ${agent.avatar_color}66`, color: agent.avatar_color }}
          >
            {agent.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</div>
            <div className="text-xs text-muted">{agent.role}</div>
          </div>
          <div className="flex gap-1">
            {(['chat', 'profile', 'model'] as const).map((t) => (
              <button
                key={t}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  tab === t ? 'bg-surface-3' : 'hover:bg-surface-2'
                }`}
                style={{ color: tab === t ? 'var(--text-primary)' : 'var(--muted)' }}
                onClick={() => setTab(t)}
              >
                {t}
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
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4"
                    style={{ backgroundColor: agent.avatar_color + '22', border: `1px solid ${agent.avatar_color}44`, color: agent.avatar_color }}
                  >
                    {agent.name[0].toUpperCase()}
                  </div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Chat with {agent.name}</div>
                  <div className="text-xs text-muted max-w-xs">
                    {agent.description || `${agent.name} is ready to help. Send a message to start.`}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} agentName={agent.name} agentColor={agent.avatar_color} />
              ))}

              {sending && (
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: agent.avatar_color + '33', color: agent.avatar_color }}
                  >
                    {agent.name[0].toUpperCase()}
                  </div>
                  <div className="bg-surface-2 border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-4">
                      <div className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
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
              <div className="flex items-end gap-3 bg-surface-2 border border-border rounded-xl px-4 py-3 focus-within:border-accent/50 transition-colors">
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
        ) : (
          <ModelTab agent={agent} onSave={(data) => updateAgent(agent.id, data)} />
        )}
      </div>
    </div>
  )
}

function MessageBubble({ msg, agentName, agentColor }: {
  msg: ChatMessage
  agentName: string
  agentColor: string
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-accent/20 border border-accent/30 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
        style={{ backgroundColor: agentColor + '33', color: agentColor }}
      >
        {agentName[0].toUpperCase()}
      </div>
      <div className="max-w-[70%] bg-surface-2 border border-border rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
      </div>
    </div>
  )
}

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
    <div className="flex-1 overflow-y-auto px-6 py-6 max-w-xl">
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
  )
}

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
    <div className="flex-1 overflow-y-auto px-6 py-6 max-w-xl">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>AI Model</p>
          <p className="text-xs text-muted">
            Override the default model for this agent. Default: <span className="text-subtle">{defaultLabel}</span>
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`w-10 h-5 rounded-full transition-colors relative ${useCustom ? 'bg-accent' : 'bg-surface-3'}`}
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
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border rounded-lg overflow-hidden z-10 shadow-lg">
                    {(PROVIDER_MODELS[provider] ?? [])
                      .filter((s) => s.toLowerCase().includes(modelId.toLowerCase()))
                      .map((s) => (
                        <button
                          key={s}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 transition-colors"
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
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  )
}
