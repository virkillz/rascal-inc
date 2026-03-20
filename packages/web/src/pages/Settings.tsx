import { useEffect, useRef, useState } from 'react'
import { api, type Provider } from '../api.ts'
import { useStore } from '../store.ts'

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

export default function Settings() {
  const { settings, providers, loadProviders, updateSettings } = useStore()
  const [loading, setLoading] = useState(false)

  // Default model state
  const [modelProvider, setModelProvider] = useState(settings?.defaultModel?.provider ?? 'openrouter')
  const [modelId, setModelId] = useState(settings?.defaultModel?.modelId ?? 'anthropic/claude-sonnet-4-6')
  const [thinkingLevel, setThinkingLevel] = useState(settings?.defaultModel?.thinkingLevel ?? 'low')
  const [modelSaved, setModelSaved] = useState(false)

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // Sync local state when settings load
  useEffect(() => {
    if (settings?.defaultModel) {
      setModelProvider(settings.defaultModel.provider)
      setModelId(settings.defaultModel.modelId)
      setThinkingLevel(settings.defaultModel.thinkingLevel)
    }
  }, [settings])

  async function saveDefaultModel() {
    setLoading(true)
    try {
      await updateSettings({ defaultModel: { provider: modelProvider, modelId, thinkingLevel } })
      setModelSaved(true)
      setTimeout(() => setModelSaved(false), 2000)
    } finally {
      setLoading(false)
    }
  }

  function handleProviderChange(p: string) {
    setModelProvider(p)
    const suggestions = PROVIDER_MODELS[p]
    if (suggestions?.length) setModelId(suggestions[0])
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-10 bg-gray-900/80 backdrop-blur-md rounded-md mt-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Manage providers and default AI model.</p>
        </div>

        {/* ── Default Model ── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Default AI Model</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Used by all agents unless they have a custom model configured.
            </p>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Provider</label>
              <select
                className="input"
                value={modelProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}{p.configured ? '' : ' (not configured)'}
                  </option>
                ))}
                {providers.length === 0 && (
                  <option value={modelProvider}>{modelProvider}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Model</label>
              <ModelCombobox
                value={modelId}
                onChange={setModelId}
                suggestions={PROVIDER_MODELS[modelProvider] ?? []}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Thinking level</label>
              <select className="input" value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
                {THINKING_LEVELS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button className="btn-primary" onClick={saveDefaultModel} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
              {modelSaved && <span className="text-xs text-green-400">Saved</span>}
            </div>
          </div>
        </section>

        {/* ── Providers ── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Providers</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Configure API keys for the LLM providers you want to use.
            </p>
          </div>

          <div className="space-y-2">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onSaved={loadProviders}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ProviderCard({ provider, onSaved }: { provider: Provider; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleExpand() {
    setExpanded((v) => !v)
    setApiKey('')
    setError('')
    if (!expanded) setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleSave() {
    if (!apiKey.trim()) { setError('API key is required'); return }
    setSaving(true)
    setError('')
    try {
      await api.settings.saveProviderKey(provider.id, apiKey.trim())
      setSaved(true)
      setApiKey('')
      setExpanded(false)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setError('')
    try {
      await api.settings.removeProviderKey(provider.id)
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={handleExpand}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${provider.configured ? 'bg-green-400' : 'bg-surface-3'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{provider.label}</span>
            {provider.recommended && (
              <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium">
                Recommended
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {provider.configured ? 'Configured' : 'Not configured'} · {provider.envKey}
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="relative">
            <input
              ref={inputRef}
              className="input pr-10"
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--muted)' }}
              onClick={() => setShowKey((v) => !v)}
              type="button"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {saved && <p className="text-xs text-green-400">Saved!</p>}

          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs px-3 py-1.5" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : provider.configured ? 'Update key' : 'Save key'}
            </button>
            {provider.configured && (
              <button
                className="btn-ghost text-xs px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelCombobox({ value, onChange, suggestions }: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Enter or select a model ID..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border rounded-lg overflow-hidden z-10 shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      style={{ color: 'var(--muted)' }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
