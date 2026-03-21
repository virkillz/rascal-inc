import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import type { Agent, CreateAgentInput } from '../api.ts'
import { api } from '../api.ts'

type HireMode = 'ai' | 'human'

export default function Roster() {
  const { agents, addAgent, deleteAgent, agentStatus, setAgentStatus } = useStore()
  const navigate = useNavigate()

  useAppEvents((event) => {
    if (event.type === 'agent:thinking') setAgentStatus(event.agentId, 'thinking')
    else if (event.type === 'agent:idle') setAgentStatus(event.agentId, 'idle')
    else if (event.type === 'agent:error') setAgentStatus(event.agentId, 'error')
  })

  const [hireMode, setHireMode] = useState<HireMode | null>(agents.length === 0 ? 'ai' : null)
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Employee Roster
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {agents.length === 0
                ? 'No employees yet — hire your first one'
                : `${agents.length} employee${agents.length !== 1 ? 's' : ''} on staff`}
            </p>
          </div>
          {hireMode === null && (
            <div className="relative" ref={pickerRef}>
              <button
                className="btn-primary flex items-center gap-1.5"
                onClick={() => setShowPicker((v) => !v)}
              >
                <span className="text-base leading-none">+</span>
                Hire Employee
                <span className="text-[10px] opacity-60 ml-0.5">▾</span>
              </button>
              {showPicker && (
                <div
                  className="absolute right-0 mt-1.5 z-50 rounded-lg overflow-hidden"
                  style={{
                    background: 'rgb(var(--s2))',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    minWidth: '160px',
                  }}
                >
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setHireMode('human'); setShowPicker(false) }}
                  >
                    <span className="text-base">👤</span>
                    Hire Human
                  </button>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setHireMode('ai'); setShowPicker(false) }}
                  >
                    <span className="text-base">🤖</span>
                    Hire AI
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Employee list */}
        {agents.length > 0 && (
          <div className="space-y-2 mb-5">
            {agents.map((agent) => (
              <EmployeeCard
                key={agent.id}
                agent={agent}
                status={agentStatus[agent.id]}
                onClick={() => navigate(`/agents/${agent.id}`)}
                onDelete={agent.source === 'user' ? () => deleteAgent(agent.id) : undefined}
              />
            ))}
          </div>
        )}

        {/* Hire AI form */}
        {hireMode === 'ai' && (
          <div className="animate-zoom-in">
            <HireForm
              onAdd={async (data) => {
                const agent = await addAgent(data)
                setHireMode(null)
                navigate(`/agents/${agent.id}`)
              }}
              onCancel={() => setHireMode(null)}
              canCancel={agents.length > 0}
            />
          </div>
        )}

        {/* Hire Human form */}
        {hireMode === 'human' && (
          <div className="animate-zoom-in">
            <HireHumanForm
              onDone={() => setHireMode(null)}
              onCancel={() => setHireMode(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({ agent, status, onClick, onDelete }: {
  agent: Agent
  status?: 'idle' | 'thinking' | 'error'
  onClick: () => void
  onDelete?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stats = deriveStats(agent.id + agent.name)

  const { label: statusLabel, cls: statusCls, dotColor } = resolveStatus(agent, status)

  return (
    <div
      className="group cursor-pointer transition-all"
      style={{
        background: 'rgba(8, 18, 40, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
      }}
      onClick={onClick}
    >
      {/* Hover highlight */}
      <div
        className="flex items-center gap-4 px-4 py-3.5 rounded-lg transition-colors group-hover:bg-white/5"
        style={{ borderRadius: '8px' }}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {agent.avatar_url ? (
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="w-11 h-11 rounded-full object-cover"
              style={{ border: `2px solid ${agent.avatar_color}55` }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold"
              style={{
                backgroundColor: agent.avatar_color + '22',
                border: `2px solid ${agent.avatar_color}55`,
                color: agent.avatar_color,
              }}
            >
              {agent.name[0].toUpperCase()}
            </div>
          )}
          {/* Status dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${status === 'thinking' ? 'animate-pulse-dot' : ''}`}
            style={{
              background: dotColor,
              border: '2px solid rgb(var(--s1))',
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {agent.name}
            </span>
            <span className={`badge ${statusCls} flex-shrink-0`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>
            {agent.role}
          </div>
          {/* Stat bars */}
          <div className="flex items-center gap-3">
            {stats.map((stat) => (
              <StatBar key={stat.label} label={stat.label} value={stat.value} color={stat.color} />
            ))}
            <span
              className="text-[10px] font-medium ml-1"
              style={{
                background: 'rgba(245,158,11,0.1)',
                color: 'rgb(var(--accent))',
                border: '1px solid rgba(245,158,11,0.2)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {agent.modelConfig?.provider ?? 'default'}
            </span>
            {agent.source !== 'user' && (
              <span
                className="text-[10px] font-medium"
                style={{
                  background: 'rgba(96,165,250,0.1)',
                  color: 'var(--status-blue)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                template
              </span>
            )}
          </div>
        </div>

        {/* Delete control */}
        {onDelete && (
          <div
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDelete ? (
              <div className="flex gap-1">
                <button
                  className="text-[11px] px-2 py-1 rounded font-semibold transition-colors"
                  style={{ background: 'var(--status-red-bg)', color: 'var(--status-red)', border: '1px solid var(--status-red-border)' }}
                  onClick={() => onDelete()}
                >
                  Confirm
                </button>
                <button
                  className="text-[11px] px-2 py-1 rounded transition-colors"
                  style={{ background: 'rgb(var(--s3))', color: 'var(--subtle)' }}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="w-7 h-7 flex items-center justify-center rounded transition-colors text-xs"
                style={{ background: 'rgb(var(--s3))', color: 'var(--muted)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--status-red)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}
                onClick={() => setConfirmDelete(true)}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium" style={{ color: 'var(--muted)', minWidth: '32px' }}>
        {label}
      </span>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ width: '52px', background: 'rgb(var(--s3))' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Hire Form ────────────────────────────────────────────────────────────────

const DEFAULT_PROMPTS: Record<string, string> = {
  'Software Engineer': 'You are a skilled software engineer. You write clean, well-documented code and can help debug issues, review PRs, and architect solutions.',
  'Product Manager': 'You are an experienced product manager. You help define requirements, prioritize features, and ensure the team ships the right things.',
  'Designer': 'You are a creative designer with a strong eye for UX. You help with design decisions, user flows, and visual direction.',
  'Writer': 'You are a skilled writer and editor. You help produce clear, engaging content and can review and improve any written material.',
  'Analyst': 'You are a sharp analyst. You help investigate data, identify patterns, and provide actionable insights.',
}

function HireForm({ onAdd, onCancel, canCancel }: {
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
    if (DEFAULT_PROMPTS[r] && !systemPrompt) setSystemPrompt(DEFAULT_PROMPTS[r])
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
    <div
      className="rounded-lg p-5"
      style={{ background: 'rgba(8, 18, 40, 0.80)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hire New Employee</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Configure your new AI team member</p>
        </div>
        {canCancel && (
          <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Name <span style={{ color: 'rgb(var(--accent))' }}>*</span>
          </label>
          <input className="input" placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Role <span style={{ color: 'rgb(var(--accent))' }}>*</span>
          </label>
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

      <div className="mb-3">
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          Description <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>(optional)</span>
        </label>
        <input className="input" placeholder="A short bio for the roster..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          System Prompt <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>(optional)</span>
        </label>
        <textarea
          className="input resize-none h-24 font-mono text-xs"
          placeholder="Describe how this agent should behave..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Hiring...' : 'Confirm Hire'}
      </button>
    </div>
  )
}

// ─── Hire Human Form ──────────────────────────────────────────────────────────

function HireHumanForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!username.trim()) { setError('Username is required'); return }
    if (!displayName.trim()) { setError('Display name is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    setSaving(true)
    setError('')
    try {
      await api.users.create({ username: username.trim(), displayName: displayName.trim(), password, isAdmin })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-lg p-5"
      style={{ background: 'rgba(8, 18, 40, 0.80)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hire Human Employee</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Create login credentials for a new team member</p>
        </div>
        <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Username <span style={{ color: 'rgb(var(--accent))' }}>*</span>
          </label>
          <input
            className="input"
            placeholder="jsmith"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Display Name <span style={{ color: 'rgb(var(--accent))' }}>*</span>
          </label>
          <input
            className="input"
            placeholder="Jane Smith"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          Password <span style={{ color: 'rgb(var(--accent))' }}>*</span>
        </label>
        <input
          className="input"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          id="hire-human-admin"
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="rounded"
          style={{ accentColor: 'rgb(var(--accent))' }}
        />
        <label htmlFor="hire-human-admin" className="text-xs cursor-pointer" style={{ color: 'var(--subtle)' }}>
          Admin access
        </label>
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Hiring...' : 'Confirm Hire'}
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStatus(agent: Agent, status?: string) {
  if (!agent.is_active) return { label: 'Offline', cls: 'badge-offline', dotColor: 'var(--status-gray)' }
  if (status === 'thinking') return { label: 'Working', cls: 'badge-working', dotColor: 'var(--status-amber)' }
  if (status === 'error') return { label: 'Error', cls: 'badge-error', dotColor: 'var(--status-red)' }
  return { label: 'Online', cls: 'badge-active', dotColor: 'var(--status-green)' }
}

function hashInt(str: string, salt: number): number {
  let h = salt * 2654435761
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761)
  }
  return Math.abs(h >>> 0)
}

const STAT_CONFIGS = [
  { label: 'EFF', color: '#4ade80' },
  { label: 'FOC', color: '#f59e0b' },
  { label: 'SPD', color: '#60a5fa' },
]

function deriveStats(seed: string) {
  return STAT_CONFIGS.map((cfg, i) => ({
    label: cfg.label,
    color: cfg.color,
    value: 30 + (hashInt(seed, i + 7) % 60),
  }))
}
