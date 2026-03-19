import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import type { Agent, CreateAgentInput } from '../api.ts'

export default function Roster() {
  const { agents, addAgent, deleteAgent } = useStore()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(agents.length === 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white">Roster</h1>
            <p className="text-sm text-muted mt-0.5">
              {agents.length === 0
                ? 'No employees yet. Add your first one.'
                : `${agents.length} employee${agents.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAdd(true)}>
            <span className="text-lg leading-none">+</span>
            Add employee
          </button>
        </div>

        {/* Agent grid */}
        {agents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => navigate(`/agents/${agent.id}`)}
                onDelete={agent.source === 'user' ? () => deleteAgent(agent.id) : undefined}
              />
            ))}
          </div>
        )}

        {/* Add agent panel */}
        {showAdd && (
          <AddAgentForm
            onAdd={async (data) => {
              const agent = await addAgent(data)
              setShowAdd(false)
              navigate(`/agents/${agent.id}`)
            }}
            onCancel={() => setShowAdd(false)}
            canCancel={agents.length > 0}
          />
        )}
      </div>
    </div>
  )
}

function AgentCard({ agent, onClick, onDelete }: {
  agent: Agent
  onClick: () => void
  onDelete?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className="card p-5 cursor-pointer hover:border-accent/40 transition-colors group relative"
      onClick={onClick}
    >
      {/* Delete button */}
      {onDelete && (
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
                onClick={() => onDelete()}
              >
                Delete
              </button>
              <button
                className="text-[10px] px-2 py-0.5 bg-surface-3 text-muted rounded hover:text-white transition-colors"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="w-6 h-6 flex items-center justify-center rounded bg-surface-3 text-muted hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-colors text-xs"
              onClick={() => setConfirmDelete(true)}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Avatar */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white mb-4"
        style={{ backgroundColor: agent.avatar_color + '33', border: `1px solid ${agent.avatar_color}66` }}
      >
        <span style={{ color: agent.avatar_color }}>{agent.name[0].toUpperCase()}</span>
      </div>

      <div className="text-sm font-semibold text-white">{agent.name}</div>
      <div className="text-xs text-muted mt-0.5 mb-2">{agent.role}</div>
      {agent.description && (
        <p className="text-xs text-subtle line-clamp-2">{agent.description}</p>
      )}

      {/* Model badge */}
      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[10px] text-muted bg-surface-3 px-2 py-0.5 rounded-full">
          {agent.modelConfig?.provider ?? 'default'}
        </span>
        {agent.source !== 'user' && (
          <span className="text-[10px] text-muted bg-surface-3 px-2 py-0.5 rounded-full">
            template
          </span>
        )}
      </div>
    </div>
  )
}

const DEFAULT_PROMPTS: Record<string, string> = {
  'Software Engineer': 'You are a skilled software engineer. You write clean, well-documented code and can help debug issues, review PRs, and architect solutions.',
  'Product Manager': 'You are an experienced product manager. You help define requirements, prioritize features, and ensure the team ships the right things.',
  'Designer': 'You are a creative designer with a strong eye for UX. You help with design decisions, user flows, and visual direction.',
  'Writer': 'You are a skilled writer and editor. You help produce clear, engaging content and can review and improve any written material.',
  'Analyst': 'You are a sharp analyst. You help investigate data, identify patterns, and provide actionable insights.',
}

function AddAgentForm({ onAdd, onCancel, canCancel }: {
  onAdd: (data: CreateAgentInput) => Promise<void>
  onCancel: () => void
  canCancel: boolean
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleRoleChange(r: string) {
    setRole(r)
    if (DEFAULT_PROMPTS[r] && !systemPrompt) {
      setSystemPrompt(DEFAULT_PROMPTS[r])
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!role.trim()) { setError('Role is required'); return }
    setSaving(true)
    setError('')
    try {
      await onAdd({ name: name.trim(), role: role.trim(), description: description.trim(), systemPrompt: systemPrompt.trim() })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-white">New employee</h2>
        {canCancel && (
          <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-subtle mb-1.5">Name *</label>
          <input className="input" placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-subtle mb-1.5">Role *</label>
          <input
            className="input"
            placeholder="Software Engineer"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            list="role-suggestions"
          />
          <datalist id="role-suggestions">
            {Object.keys(DEFAULT_PROMPTS).map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-subtle mb-1.5">Description <span className="text-muted font-normal">(optional)</span></label>
        <input className="input" placeholder="A short bio for the roster card..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mb-5">
        <label className="block text-xs font-medium text-subtle mb-1.5">System prompt <span className="text-muted font-normal">(optional)</span></label>
        <textarea
          className="input resize-none h-28 font-mono text-xs"
          placeholder="Describe how this agent should behave and what they know..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

      <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Creating...' : 'Create employee'}
      </button>
    </div>
  )
}
