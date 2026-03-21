import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { api, type BoardFull, type Card, type ChatMessage, type Agent, type User } from '../api.ts'

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function avatar(name: string, color: string, url?: string, size = 28) {
  const s = `${size}px`
  if (url) return <img src={url} alt={name} style={{ width: s, height: s, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}55`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700,
    }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string
  text: string
  time: string
  actorName: string
  actorColor: string
  actorUrl?: string
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { agents, agentStatus, setAgentStatus } = useStore()
  const navigate = useNavigate()

  const [board, setBoard] = useState<BoardFull | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  // Chat assistant state
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // Load board + users on mount
  useEffect(() => {
    Promise.all([api.boards.list(), api.users.list()])
      .then(async ([boards, us]) => {
        setUsers(us)
        if (boards.length > 0) {
          const full = await api.boards.get(boards[0].id)
          setBoard(full)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Pick default chat agent
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  // Load chat history when agent changes
  useEffect(() => {
    if (!selectedAgentId) return
    setMessages([])
    api.chat.history(selectedAgentId).then(setMessages).catch(() => {})
  }, [selectedAgentId])

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // WebSocket events
  useAppEvents((event) => {
    if (event.type === 'agent:thinking') setAgentStatus(event.agentId, 'thinking')
    else if (event.type === 'agent:idle') setAgentStatus(event.agentId, 'idle')
    else if (event.type === 'agent:error') setAgentStatus(event.agentId, 'error')
    else if (event.type === 'board:card_moved') {
      // Refresh board on card move
      api.boards.list().then(boards => {
        if (boards.length > 0) api.boards.get(boards[0].id).then(setBoard).catch(() => {})
      }).catch(() => {})
      // Add to activity
      const actor = agents.find(a => a.id === event.cardId) // best-effort
      const item: ActivityItem = {
        id: `${Date.now()}`,
        text: `Card "${event.title}" was moved`,
        time: new Date().toISOString(),
        actorName: 'System',
        actorColor: '#6b7280',
      }
      setActivity(prev => [item, ...prev].slice(0, 50))
    }
  })

  // Derived stats
  const activeAgents = agents.filter(a => a.is_active).length
  const thinkingCount = Object.values(agentStatus).filter(s => s === 'thinking').length
  const allCards = board?.cards.filter(c => !c.is_archived) ?? []
  const todoLane = board?.lanes.find(l => l.lane_type === 'todo')
  const inProgressLane = board?.lanes.find(l => l.lane_type === 'in_progress')
  const doneLane = board?.lanes.find(l => l.lane_type === 'done')
  const todoCount = allCards.filter(c => c.lane_id === todoLane?.id).length
  const inProgressCount = allCards.filter(c => c.lane_id === inProgressLane?.id).length
  const doneCount = allCards.filter(c => c.lane_id === doneLane?.id).length

  function resolveAssignee(card: Card): { name: string; color: string; url?: string } | null {
    if (!card.assignee_id) return null
    if (card.assignee_type === 'agent') {
      const a = agents.find(ag => ag.id === card.assignee_id)
      return a ? { name: a.name, color: a.avatar_color, url: a.avatar_url || undefined } : null
    }
    const u = users.find(u => u.id === card.assignee_id)
    return u ? { name: u.display_name, color: u.avatar_color, url: u.avatar_url || undefined } : null
  }

  async function sendChat() {
    if (!chatInput.trim() || sending || !selectedAgentId) return
    const msg = chatInput.trim()
    setChatInput('')
    setSending(true)
    const userMsg: ChatMessage = {
      id: Date.now(), agent_id: selectedAgentId, role: 'user',
      content: msg, created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    try {
      const { reply } = await api.chat.send(selectedAgentId, msg)
      setMessages(prev => [...prev, {
        id: Date.now() + 1, agent_id: selectedAgentId, role: 'assistant',
        content: reply, created_at: new Date().toISOString(),
      }])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setSending(false)
      setTimeout(() => chatInputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">

        {/* ── Stats Bar ── */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}
        >
          <StatCard label="Total Staff" value={String(agents.length)} icon="👥" color="var(--status-blue)" />
          <StatCard label="Active" value={String(activeAgents)} icon="✓" color="var(--status-green)" />
          <StatCard label="Working" value={String(thinkingCount)} icon="⚡" color="rgb(var(--accent))" highlight={thinkingCount > 0} />
          <StatCard label="To Do" value={String(todoCount)} icon="○" color="var(--subtle)" />
          <StatCard label="In Progress" value={String(inProgressCount)} icon="◑" color="var(--status-amber)" />
          <StatCard label="Done" value={String(doneCount)} icon="●" color="var(--status-green)" />
        </div>

        {/* ── Main Grid ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '260px 1fr 280px', gridTemplateRows: 'auto auto', alignItems: 'start' }}>

          {/* ── Employee Roster ── (left, spans 2 rows) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
              gridRow: '1 / 3',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Employee Roster
              </span>
              <Link
                to="/roster"
                className="text-[10px] font-medium transition-opacity hover:opacity-100"
                style={{ color: 'rgb(var(--accent))', opacity: 0.7 }}
              >
                View all →
              </Link>
            </div>
            <div className="p-2 space-y-1">
              {agents.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--muted)' }}>No employees yet</p>
              ) : (
                agents.map(agent => (
                  <RosterRow
                    key={agent.id}
                    agent={agent}
                    status={agentStatus[agent.id]}
                    taskCount={allCards.filter(c => c.assignee_id === agent.id).length}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Kanban Summary ── (center top) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Task Board
              </span>
              <Link
                to="/board"
                className="text-[10px] font-medium transition-opacity hover:opacity-100"
                style={{ color: 'rgb(var(--accent))', opacity: 0.7 }}
              >
                Open board →
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }} />
              </div>
            ) : !board ? (
              <div className="text-center py-10">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>No board yet</p>
                <Link to="/board" className="text-xs mt-2 inline-block" style={{ color: 'rgb(var(--accent))' }}>Create one →</Link>
              </div>
            ) : (
              <div className="grid gap-3 p-3" style={{ gridTemplateColumns: `repeat(${board.lanes.length}, 1fr)` }}>
                {board.lanes.map(lane => {
                  const laneCards = allCards.filter(c => c.lane_id === lane.id)
                  const typeColor = lane.lane_type === 'done' ? 'var(--status-green)'
                    : lane.lane_type === 'in_progress' ? 'var(--status-amber)'
                    : 'var(--subtle)'
                  return (
                    <div key={lane.id}>
                      <div className="flex items-center justify-between mb-2 px-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: typeColor }}>
                          {lane.name}
                        </span>
                        <span
                          className="text-[10px] font-bold ml-1 flex-shrink-0 w-4 h-4 rounded flex items-center justify-center"
                          style={{ background: typeColor + '22', color: typeColor }}
                        >
                          {laneCards.length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {laneCards.slice(0, 4).map(card => {
                          const assignee = resolveAssignee(card)
                          return (
                            <div
                              key={card.id}
                              className="rounded-lg px-2.5 py-2 cursor-pointer transition-colors hover:bg-white/5"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                              onClick={() => navigate('/board')}
                            >
                              <p className="text-xs leading-snug line-clamp-2 mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                {card.title}
                              </p>
                              <div className="flex items-center justify-between">
                                {assignee ? (
                                  <div className="flex items-center gap-1">
                                    {avatar(assignee.name, assignee.color, assignee.url, 16)}
                                    <span className="text-[10px] truncate max-w-[70px]" style={{ color: 'var(--muted)' }}>
                                      {assignee.name}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Unassigned</span>
                                )}
                                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                                  {timeAgo(card.updated_at)}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                        {laneCards.length > 4 && (
                          <p className="text-[10px] text-center py-0.5" style={{ color: 'var(--muted)' }}>
                            +{laneCards.length - 4} more
                          </p>
                        )}
                        {laneCards.length === 0 && (
                          <div
                            className="rounded-lg py-4 text-center"
                            style={{ border: '1px dashed rgba(255,255,255,0.08)' }}
                          >
                            <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Empty</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Notifications ── (right top) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Notifications
              </span>
            </div>
            <NotificationsWidget agents={agents} agentStatus={agentStatus} />
          </div>

          {/* ── Activity Log ── (center bottom) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Activity Log
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>
                Live
              </span>
            </div>
            <ActivityLog board={board} agents={agents} users={users} extraItems={activity} />
          </div>

          {/* ── Chat Assistant ── (right bottom) */}
          <div
            className="rounded-xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
              minHeight: '300px',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Chat Assistant
              </span>
              {agents.length > 1 && (
                <select
                  className="text-[10px] rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer"
                  style={{ background: 'rgb(var(--s3))', color: 'var(--text-primary)' }}
                  value={selectedAgentId}
                  onChange={e => setSelectedAgentId(e.target.value)}
                >
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: '260px' }}>
              {messages.length === 0 && !sending ? (
                <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                  {agents.length === 0 ? (
                    <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                      No agents yet. <Link to="/roster" style={{ color: 'rgb(var(--accent))' }}>Hire one →</Link>
                    </p>
                  ) : (
                    <>
                      <span className="text-xl">💬</span>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Ask {agents.find(a => a.id === selectedAgentId)?.name ?? 'an agent'} anything
                      </p>
                    </>
                  )}
                </div>
              ) : (
                messages.slice(-20).map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div
                      className="rounded-lg px-2.5 py-1.5 text-xs leading-relaxed max-w-[85%]"
                      style={{
                        background: msg.role === 'user'
                          ? 'rgba(245,158,11,0.12)'
                          : 'rgba(255,255,255,0.06)',
                        color: 'var(--text-primary)',
                        border: msg.role === 'user'
                          ? '1px solid rgba(245,158,11,0.2)'
                          : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex gap-2">
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-primary)', lineHeight: '1.4',
                  }}
                  placeholder={agents.length === 0 ? 'No agents available' : 'Type a message...'}
                  value={chatInput}
                  disabled={agents.length === 0 || sending}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                />
                <button
                  className="px-3 rounded-lg text-xs font-semibold flex-shrink-0 transition-opacity disabled:opacity-30"
                  style={{ background: 'rgb(var(--accent))', color: '#000' }}
                  disabled={!chatInput.trim() || sending || agents.length === 0}
                  onClick={sendChat}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, highlight }: {
  label: string; value: string; icon: string; color: string; highlight?: boolean
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: highlight ? `${color}18` : 'rgba(8,18,40,0.75)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${highlight ? color + '44' : 'rgba(255,255,255,0.10)'}`,
      }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <div>
        <div className="text-xl font-bold leading-none" style={{ color }}>{value}</div>
        <div className="text-[10px] font-medium mt-0.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
      </div>
    </div>
  )
}

// ── Roster Row ─────────────────────────────────────────────────────────────────

function RosterRow({ agent, status, taskCount, onClick }: {
  agent: Agent; status?: string; taskCount: number; onClick: () => void
}) {
  const dotColor = !agent.is_active ? 'var(--status-gray)'
    : status === 'thinking' ? 'var(--status-amber)'
    : status === 'error' ? 'var(--status-red)'
    : 'var(--status-green)'

  const statusLabel = !agent.is_active ? 'Offline'
    : status === 'thinking' ? 'Working'
    : status === 'error' ? 'Error'
    : 'Online'

  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
      onClick={onClick}
    >
      <div className="relative flex-shrink-0">
        {avatar(agent.name, agent.avatar_color, agent.avatar_url || undefined, 32)}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${status === 'thinking' ? 'animate-pulse' : ''}`}
          style={{ background: dotColor, border: '1.5px solid rgb(var(--s1))' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {agent.name}
          </span>
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{agent.role}</div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            background: dotColor + '22',
            color: dotColor,
          }}
        >
          {statusLabel}
        </span>
        {taskCount > 0 && (
          <span className="text-[9px]" style={{ color: 'var(--muted)' }}>
            {taskCount} task{taskCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Notifications Widget ───────────────────────────────────────────────────────

function NotificationsWidget({ agents, agentStatus }: { agents: Agent[]; agentStatus: Record<string, string> }) {
  const [items, setItems] = useState<Array<{ id: string; icon: string; text: string; time: string; color: string }>>([])

  useAppEvents((event) => {
    let item: { id: string; icon: string; text: string; time: string; color: string } | null = null
    const time = new Date().toISOString()

    if (event.type === 'agent:thinking') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: '⚡', text: `${a?.name ?? 'Agent'} started working`, time, color: 'var(--status-amber)' }
    } else if (event.type === 'agent:idle') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: '✓', text: `${a?.name ?? 'Agent'} finished`, time, color: 'var(--status-green)' }
    } else if (event.type === 'agent:error') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: '✕', text: `${a?.name ?? 'Agent'} encountered an error`, time, color: 'var(--status-red)' }
    } else if (event.type === 'board:card_moved') {
      item = { id: `${Date.now()}`, icon: '↕', text: `Card "${event.title}" moved`, time, color: 'var(--status-blue)' }
    } else if (event.type === 'schedule:fired') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: '⏰', text: `Schedule fired for ${a?.name ?? 'agent'}: ${event.label}`, time, color: 'rgb(var(--accent))' }
    }

    if (item) setItems(prev => [item!, ...prev].slice(0, 30))
  })

  // Seed with any currently-thinking agents
  const thinking = agents.filter(a => agentStatus[a.id] === 'thinking')

  return (
    <div className="p-3 space-y-1.5" style={{ maxHeight: '220px', overflowY: 'auto' }}>
      {thinking.map(a => (
        <div key={a.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
          <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: 'var(--status-amber)' }}>⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{a.name} is working</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>now</p>
          </div>
        </div>
      ))}
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
          <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: item.color }}>{item.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{item.text}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{timeAgo(item.time)}</p>
          </div>
        </div>
      ))}
      {items.length === 0 && thinking.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <span className="text-xl">🔔</span>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>No recent notifications</p>
        </div>
      )}
    </div>
  )
}

// ── Activity Log ──────────────────────────────────────────────────────────────

function ActivityLog({ board, agents, users, extraItems }: {
  board: BoardFull | null
  agents: Agent[]
  users: User[]
  extraItems: ActivityItem[]
}) {
  // Build activity from board card events (use recent card updates as proxy)
  const cards = board?.cards.filter(c => !c.is_archived) ?? []
  const lanes = board?.lanes ?? []

  // Create activity entries from cards sorted by updated_at
  const cardActivity: ActivityItem[] = cards
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 20)
    .map(card => {
      const lane = lanes.find(l => l.id === card.lane_id)
      let actorName = 'System'
      let actorColor = '#6b7280'
      let actorUrl: string | undefined

      if (card.created_by) {
        if (card.created_by_type === 'agent') {
          const a = agents.find(ag => ag.id === card.created_by)
          if (a) { actorName = a.name; actorColor = a.avatar_color; actorUrl = a.avatar_url || undefined }
        } else {
          const u = users.find(u => u.id === card.created_by)
          if (u) { actorName = u.display_name; actorColor = u.avatar_color; actorUrl = u.avatar_url || undefined }
        }
      }

      return {
        id: card.id,
        text: `"${card.title}" is in ${lane?.name ?? 'a lane'}`,
        time: card.updated_at,
        actorName,
        actorColor,
        actorUrl,
      }
    })

  // Merge extra (WS) items with card activity, deduplicate by id
  const seen = new Set<string>()
  const all = [...extraItems, ...cardActivity].filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="text-xl">📋</span>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>No activity yet</p>
      </div>
    )
  }

  return (
    <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.05)', maxHeight: '280px', overflowY: 'auto' }}>
      {all.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
          <div className="flex-shrink-0">
            {avatar(item.actorName, item.actorColor, item.actorUrl, 24)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>{item.actorName} </span>
            <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{item.text}</span>
          </div>
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--muted)' }}>
            {timeAgo(item.time)}
          </span>
        </div>
      ))}
    </div>
  )
}
