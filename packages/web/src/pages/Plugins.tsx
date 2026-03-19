import { useEffect, useState } from 'react'
import { useStore } from '../store.ts'
import type { Plugin } from '../api.ts'

const PLUGIN_ICONS: Record<string, string> = {
  elevenlabs:    '🎙️',
  'gemini-image': '🖼️',
  youtube:       '▶️',
  slack:         '💬',
  notion:        '📝',
  github:        '🐙',
  openai:        '🤖',
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const { configurePlugin, removePluginConfig } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError('')
    try {
      await configurePlugin(plugin.id, apiKey.trim())
      setApiKey('')
      setExpanded(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setSaving(true)
    try {
      await removePluginConfig(plugin.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-750 transition-colors"
      >
        <span className="text-2xl w-8 text-center">{PLUGIN_ICONS[plugin.id] ?? '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{plugin.display_name}</span>
            {plugin.configured ? (
              <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Configured</span>
            ) : (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Not configured</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{plugin.description}</p>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4">
          {plugin.envKey && (
            <p className="text-xs text-gray-400 mb-3">
              Env variable: <code className="text-purple-400">{plugin.envKey}</code>
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              placeholder={plugin.hasKey ? '••••••••••••' : 'Paste API key…'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm transition-colors"
            >
              {saving ? '…' : plugin.hasKey ? 'Update' : 'Save'}
            </button>
            {plugin.configured && (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="px-3 py-2 bg-gray-700 hover:bg-red-900 hover:text-red-300 disabled:opacity-50 rounded-lg text-sm transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function Plugins() {
  const { plugins, loadPlugins } = useStore()

  useEffect(() => { loadPlugins() }, [loadPlugins])

  const configured = plugins.filter(p => p.configured)
  const unconfigured = plugins.filter(p => !p.configured)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Plugins</h1>
      <p className="text-sm text-gray-400 mb-6">
        Connect external services. Plugins expose tool definitions that agents can call.
      </p>

      {configured.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Configured</h2>
          <div className="space-y-2">
            {configured.map(p => <PluginCard key={p.id} plugin={p} />)}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Available</h2>
        <div className="space-y-2">
          {unconfigured.length === 0
            ? <p className="text-gray-500 text-sm py-4">All plugins configured.</p>
            : unconfigured.map(p => <PluginCard key={p.id} plugin={p} />)
          }
        </div>
      </div>
    </div>
  )
}
