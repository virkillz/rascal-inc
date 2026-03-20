import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store.ts'
import { api, type BoardFull, type Board, type Lane, type Card, type CardEvent, type User } from '../api.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Card Detail Modal ─────────────────────────────────────────────────────────

interface CardModalProps {
  card: Card
  board: BoardFull
  onClose: () => void
  onUpdated: (card: Card) => void
  onDeleted: (cardId: string) => void
  onMoved: (card: Card) => void
  isAdmin: boolean
}

function CardModal({ card, board, onClose, onUpdated, onDeleted, onMoved, isAdmin }: CardModalProps) {
  const { agents } = useStore()
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [result, setResult] = useState(card.result)
  const [assigneeId, setAssigneeId] = useState<string>(card.assignee_id ?? '')
  const [assigneeType, setAssigneeType] = useState<'agent' | 'user' | ''>(card.assignee_type ?? '')
  const [targetLaneId, setTargetLaneId] = useState(card.lane_id)
  const [events, setEvents] = useState<CardEvent[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.boards.cardEvents(card.board_id, card.id).then(setEvents).catch(() => {})
  }, [card.board_id, card.id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updated = await api.boards.updateCard(card.board_id, card.id, {
        title: title.trim() || card.title,
        description,
        result,
        assigneeId: assigneeId || null,
        assigneeType: (assigneeType || null) as 'agent' | 'user' | null,
      })
      if (targetLaneId !== card.lane_id) {
        const moved = await api.boards.moveCard(card.board_id, card.id, targetLaneId)
        onMoved(moved)
      } else {
        onUpdated(updated)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this card? This cannot be undone.')) return
    await api.boards.deleteCard(card.board_id, card.id)
    onDeleted(card.id)
    onClose()
  }

  function getActorName(actorId: string, actorType: string): string {
    if (actorType === 'agent') {
      return agents.find((a) => a.id === actorId)?.name ?? 'Agent'
    }
    return 'User'
  }

  function describeEvent(ev: CardEvent): string {
    try {
      const meta = JSON.parse(ev.meta)
      switch (ev.action) {
        case 'created': return `created this card in ${meta.lane ?? ''}`
        case 'moved': return `moved from ${meta.from_lane ?? '?'} to ${meta.to_lane ?? '?'}`
        case 'updated': return `updated ${(meta.changed as string[])?.join(', ') ?? 'card'}`
        case 'deleted': return `deleted this card`
        default: return ev.action
      }
    } catch { return ev.action }
  }

  const currentLane = board.lanes.find((l) => l.id === card.lane_id)

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="h-full w-full max-w-lg flex flex-col overflow-hidden"
        style={{
          background: 'rgba(8,18,40,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-xs text-muted">{currentLane?.name ?? '—'}</span>
          <span className="text-muted text-xs">›</span>
          <input
            className="flex-1 bg-transparent text-sm font-semibold outline-none"
            style={{ color: 'var(--text-primary)' }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button onClick={onClose} className="text-muted hover:text-white ml-2 flex-shrink-0">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Task</label>
            <textarea
              className="input text-sm w-full resize-none"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task…"
            />
          </div>

          {/* Result */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: result ? 'var(--accent)' : 'var(--muted)' }}>
              Result {result && '✓'}
            </label>
            <textarea
              className="input text-sm w-full resize-none"
              rows={4}
              style={result ? { borderColor: 'rgba(245,158,11,0.3)' } : {}}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="Fill in the result or output when the task is done…"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Assignee</label>
            <select
              className="input text-sm w-full"
              value={assigneeId ? `${assigneeType}:${assigneeId}` : ''}
              onChange={(e) => {
                const val = e.target.value
                if (!val) { setAssigneeId(''); setAssigneeType('') }
                else {
                  const [type, id] = val.split(':')
                  setAssigneeId(id)
                  setAssigneeType(type as 'agent' | 'user')
                }
              }}
            >
              <option value="">Unassigned</option>
              <optgroup label="Agents">
                {agents.map((a) => (
                  <option key={a.id} value={`agent:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Move to lane */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Lane</label>
            <select
              className="input text-sm w-full"
              value={targetLaneId}
              onChange={(e) => setTargetLaneId(e.target.value)}
            >
              {[...board.lanes].sort((a, b) => a.position - b.position).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Meta */}
          <div className="text-xs text-muted space-y-0.5">
            <p>Created {fmtDate(card.created_at)}</p>
            {card.updated_at !== card.created_at && <p>Updated {fmtDate(card.updated_at)}</p>}
          </div>

          {/* Activity */}
          {events.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted block mb-2">Activity</label>
              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 text-[9px] font-bold"
                      style={{ background: ev.actor_type === 'agent' ? 'rgba(124,106,247,0.25)' : 'rgba(245,158,11,0.2)', color: ev.actor_type === 'agent' ? '#a78bfa' : '#fbbf24' }}
                    >
                      {ev.actor_type === 'agent' ? 'A' : 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
                        {getActorName(ev.actor_id, ev.actor_type)}
                      </span>
                      <span className="text-xs text-muted"> {describeEvent(ev)}</span>
                    </div>
                    <span className="text-[10px] text-muted flex-shrink-0">{timeAgo(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {error && <span className="text-xs text-red-400 flex-1">{error}</span>}
          {!error && <span className="flex-1" />}
          {isAdmin && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:bg-white/5 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Board ─────────────────────────────────────────────────────────────────

export default function Board() {
  const { agents, loadAgents } = useStore()
  const [boards, setBoards] = useState<Board[]>([])
  const [board, setBoard] = useState<BoardFull | null>(null)
  const [activeBoardId, setActiveBoardId] = useState<string>(() => localStorage.getItem('activeBoardId') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // Card creation
  const [newCardLane, setNewCardLane] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')

  // Card detail modal
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Drag
  const [dragging, setDragging] = useState<{ card: Card; sourceLaneId: string } | null>(null)

  // Lane editing (admin)
  const [renamingLaneId, setRenamingLaneId] = useState<string | null>(null)
  const [renamingLaneName, setRenamingLaneName] = useState('')
  const [addingLane, setAddingLane] = useState(false)
  const [newLaneName, setNewLaneName] = useState('')

  // Board editing (admin)
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [renamingBoardName, setRenamingBoardName] = useState('')
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

  const isAdmin = currentUser?.is_admin === 1

  useEffect(() => {
    api.auth.me().then(setCurrentUser).catch(() => {})
    loadAgents()
  }, [loadAgents])

  useEffect(() => {
    loadBoardList()
  }, [])

  async function loadBoardList() {
    try {
      const list = await api.boards.list()
      setBoards(list)
      const id = activeBoardId && list.find((b) => b.id === activeBoardId) ? activeBoardId : list[0]?.id ?? ''
      if (id) await loadBoard(id)
      else setLoading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load boards')
      setLoading(false)
    }
  }

  async function loadBoard(id: string) {
    setLoading(true)
    try {
      const full = await api.boards.get(id)
      setBoard(full)
      setActiveBoardId(id)
      localStorage.setItem('activeBoardId', id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }

  useAppEvents((event) => {
    if (event.type === 'board:card_moved' && board && event.boardId === board.id) {
      loadBoard(board.id)
    }
  })

  // ── Card actions ────────────────────────────────────────────────────────────

  async function addCard(laneId: string) {
    if (!board || !newCardTitle.trim()) return
    try {
      const card = await api.boards.addCard(board.id, { laneId, title: newCardTitle.trim() })
      setBoard({ ...board, cards: [...board.cards, card] })
      setNewCardTitle('')
      setNewCardLane(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add card')
    }
  }

  async function moveCard(cardId: string, toLaneId: string) {
    if (!board) return
    try {
      const updated = await api.boards.moveCard(board.id, cardId, toLaneId)
      setBoard({ ...board, cards: board.cards.map((c) => (c.id === cardId ? updated : c)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot move card to that lane')
    }
  }

  function handleCardUpdated(updated: Card) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.map((c) => (c.id === updated.id ? updated : c)) })
    if (selectedCard?.id === updated.id) setSelectedCard(updated)
  }

  function handleCardDeleted(cardId: string) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.filter((c) => c.id !== cardId) })
    setSelectedCard(null)
  }

  function handleCardMoved(updated: Card) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.map((c) => (c.id === updated.id ? updated : c)) })
    setSelectedCard(null)
  }

  // ── Lane actions (admin) ────────────────────────────────────────────────────

  async function startRenaming(lane: Lane) {
    setRenamingLaneId(lane.id)
    setRenamingLaneName(lane.name)
  }

  async function confirmRenameLane(laneId: string) {
    if (!board || !renamingLaneName.trim()) return
    const updated = await api.boards.updateLane(board.id, laneId, { name: renamingLaneName.trim() })
    setBoard({ ...board, lanes: board.lanes.map((l) => (l.id === laneId ? updated : l)) })
    setRenamingLaneId(null)
  }

  async function deleteLane(laneId: string) {
    if (!board) return
    if (!confirm('Delete this lane and all its cards?')) return
    await api.boards.deleteLane(board.id, laneId)
    setBoard({
      ...board,
      lanes: board.lanes.filter((l) => l.id !== laneId),
      cards: board.cards.filter((c) => c.lane_id !== laneId),
    })
  }

  async function shiftLane(lane: Lane, dir: -1 | 1) {
    if (!board) return
    const sorted = [...board.lanes].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((l) => l.id === lane.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    await Promise.all([
      api.boards.updateLane(board.id, lane.id, { position: swap.position }),
      api.boards.updateLane(board.id, swap.id, { position: lane.position }),
    ])
    await loadBoard(board.id)
  }

  async function addLane() {
    if (!board || !newLaneName.trim()) return
    const lane = await api.boards.addLane(board.id, newLaneName.trim())
    setBoard({ ...board, lanes: [...board.lanes, lane] })
    setNewLaneName('')
    setAddingLane(false)
  }

  // ── Board actions (admin) ────────────────────────────────────────────────────

  async function confirmRenameBoard() {
    if (!board || !renamingBoardName.trim()) return
    await api.boards.update(board.id, renamingBoardName.trim())
    const updated = { ...board, name: renamingBoardName.trim() }
    setBoard(updated)
    setBoards(boards.map((b) => (b.id === board.id ? { ...b, name: renamingBoardName.trim() } : b)))
    setRenamingBoard(false)
  }

  async function createBoard() {
    if (!newBoardName.trim()) return
    const created = await api.boards.create(newBoardName.trim())
    setBoards([...boards, created])
    setNewBoardName('')
    setCreatingBoard(false)
    await loadBoard(created.id)
  }

  async function deleteBoard() {
    if (!board) return
    if (!confirm(`Delete board "${board.name}" and all its lanes and cards?`)) return
    await api.boards.delete(board.id)
    const remaining = boards.filter((b) => b.id !== board.id)
    setBoards(remaining)
    if (remaining.length > 0) await loadBoard(remaining[0].id)
    else { setBoard(null); setActiveBoardId('') }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-full"><span className="text-sm text-muted">Loading…</span></div>
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-sm text-muted">No boards yet.</span>
        {isAdmin && (
          <button
            onClick={() => setCreatingBoard(true)}
            className="btn-primary text-sm px-4 py-2"
          >
            Create Board
          </button>
        )}
        {creatingBoard && (
          <div className="flex gap-2">
            <input
              autoFocus
              className="input text-sm"
              placeholder="Board name…"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createBoard(); if (e.key === 'Escape') setCreatingBoard(false) }}
            />
            <button onClick={createBoard} className="btn-primary text-sm px-3 py-1.5">Create</button>
          </div>
        )}
      </div>
    )
  }

  const lanes = [...board.lanes].sort((a, b) => a.position - b.position)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="px-6 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ background: 'rgba(8,18,40,0.60)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Board selector */}
        {boards.length > 1 ? (
          <select
            className="bg-transparent text-base font-semibold outline-none cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            value={activeBoardId}
            onChange={(e) => loadBoard(e.target.value)}
          >
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : renamingBoard ? (
          <input
            autoFocus
            className="input text-sm font-semibold"
            value={renamingBoardName}
            onChange={(e) => setRenamingBoardName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmRenameBoard(); if (e.key === 'Escape') setRenamingBoard(false) }}
            onBlur={confirmRenameBoard}
          />
        ) : (
          <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{board.name}</h1>
        )}

        {isAdmin && !renamingBoard && (
          <>
            <button
              onClick={() => { setRenamingBoard(true); setRenamingBoardName(board.name) }}
              className="text-muted hover:text-white transition-colors ml-0.5"
              title="Rename board"
            >
              <PencilIcon />
            </button>
            <button onClick={deleteBoard} className="text-muted hover:text-red-400 transition-colors" title="Delete board">
              <TrashIcon />
            </button>
          </>
        )}

        {isAdmin && (
          creatingBoard ? (
            <div className="flex items-center gap-1.5 ml-2">
              <input
                autoFocus
                className="input text-sm h-7 px-2"
                placeholder="New board name…"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createBoard(); if (e.key === 'Escape') setCreatingBoard(false) }}
              />
              <button onClick={createBoard} className="text-xs px-2 py-0.5 bg-accent text-white rounded-md">Create</button>
              <button onClick={() => setCreatingBoard(false)} className="text-xs text-muted px-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingBoard(true)}
              className="text-muted hover:text-accent transition-colors ml-1 text-xs"
              title="New board"
            >
              <PlusIcon />
            </button>
          )
        )}

        {error && <span className="text-xs text-red-400 ml-auto">{error}</span>}
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full items-start" style={{ minWidth: 'max-content' }}>
          {lanes.map((lane, laneIdx) => {
            const cards = board.cards.filter((c) => c.lane_id === lane.id).sort((a, b) => a.position - b.position)
            return (
              <div
                key={lane.id}
                className="w-72 flex flex-col rounded-xl animate-zoom-in"
                style={{
                  background: 'rgba(8,18,40,0.72)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging && dragging.card.lane_id !== lane.id) moveCard(dragging.card.id, lane.id)
                  setDragging(null)
                }}
              >
                {/* Lane header */}
                <div className="px-3 py-2.5 flex items-center gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {renamingLaneId === lane.id ? (
                    <input
                      autoFocus
                      className="input text-xs font-semibold flex-1 h-6 px-1.5"
                      value={renamingLaneName}
                      onChange={(e) => setRenamingLaneName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRenameLane(lane.id)
                        if (e.key === 'Escape') setRenamingLaneId(null)
                      }}
                      onBlur={() => confirmRenameLane(lane.id)}
                    />
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted flex-1">{lane.name}</span>
                  )}
                  <span className="text-xs rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--muted)' }}>
                    {cards.length}
                  </span>
                  {isAdmin && renamingLaneId !== lane.id && (
                    <div className="flex items-center gap-0.5 ml-0.5">
                      <button
                        onClick={() => shiftLane(lane, -1)}
                        disabled={laneIdx === 0}
                        className="text-muted hover:text-white disabled:opacity-20 transition-colors p-0.5"
                        title="Move left"
                      >
                        <ChevronLeftIcon />
                      </button>
                      <button
                        onClick={() => shiftLane(lane, 1)}
                        disabled={laneIdx === lanes.length - 1}
                        className="text-muted hover:text-white disabled:opacity-20 transition-colors p-0.5"
                        title="Move right"
                      >
                        <ChevronRightIcon />
                      </button>
                      <button onClick={() => startRenaming(lane)} className="text-muted hover:text-white transition-colors p-0.5" title="Rename lane">
                        <PencilIcon />
                      </button>
                      <button onClick={() => deleteLane(lane.id)} className="text-muted hover:text-red-400 transition-colors p-0.5" title="Delete lane">
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[4rem]">
                  {cards.map((card) => {
                    const assigneeName = card.assignee_type === 'agent'
                      ? (agents.find((a) => a.id === card.assignee_id)?.name ?? null)
                      : null
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => setDragging({ card, sourceLaneId: card.lane_id })}
                        onClick={() => setSelectedCard(card)}
                        className="group rounded-lg px-3 py-2.5 cursor-pointer transition-all"
                        style={{ background: 'rgba(8,18,40,0.60)', border: '1px solid rgba(255,255,255,0.09)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.35)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)' }}
                      >
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
                        {card.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{card.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {card.result && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                              result ✓
                            </span>
                          )}
                          {assigneeName && (
                            <span className="text-[10px] text-muted ml-auto truncate max-w-[6rem]">{assigneeName}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add card */}
                <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  {newCardLane === lane.id ? (
                    <div className="space-y-1.5">
                      <input
                        autoFocus
                        value={newCardTitle}
                        onChange={(e) => setNewCardTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addCard(lane.id)
                          if (e.key === 'Escape') { setNewCardLane(null); setNewCardTitle('') }
                        }}
                        placeholder="Card title…"
                        className="input text-sm"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={() => addCard(lane.id)} className="flex-1 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent-hover transition-colors">
                          Add
                        </button>
                        <button onClick={() => { setNewCardLane(null); setNewCardTitle('') }} className="px-2 py-1 text-xs text-muted hover:bg-white/5 rounded-md transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNewCardLane(lane.id); setNewCardTitle('') }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted hover:text-accent hover:bg-surface-2 rounded-lg transition-colors"
                    >
                      <PlusIcon />
                      <span>Add card</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add lane (admin) */}
          {isAdmin && (
            <div className="w-72 flex-shrink-0">
              {addingLane ? (
                <div
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <input
                    autoFocus
                    className="input text-sm w-full"
                    placeholder="Lane name…"
                    value={newLaneName}
                    onChange={(e) => setNewLaneName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLane(); if (e.key === 'Escape') setAddingLane(false) }}
                  />
                  <div className="flex gap-1.5">
                    <button onClick={addLane} className="flex-1 py-1 bg-accent text-white text-xs rounded-md">Add Lane</button>
                    <button onClick={() => setAddingLane(false)} className="px-2 text-xs text-muted hover:bg-white/5 rounded-md">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingLane(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-muted hover:text-accent transition-colors"
                  style={{ border: '1px dashed rgba(255,255,255,0.15)' }}
                >
                  <PlusIcon />
                  Add Lane
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card detail modal */}
      {selectedCard && board && (
        <CardModal
          card={selectedCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onUpdated={handleCardUpdated}
          onDeleted={handleCardDeleted}
          onMoved={handleCardMoved}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 113 3L8.5 18.854 4 20l1.146-4.5 11.716-11.013z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}
