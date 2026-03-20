import { useEffect, useState } from 'react'
import { api, type BoardFull, type Lane, type Card } from '../api.ts'

export default function Board() {
  const [board, setBoard] = useState<BoardFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newCardLane, setNewCardLane] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [dragging, setDragging] = useState<{ card: Card; sourceLaneId: string } | null>(null)

  useEffect(() => {
    loadBoard()
  }, [])

  async function loadBoard() {
    try {
      const boards = await api.boards.list()
      if (!boards.length) { setLoading(false); return }
      const full = await api.boards.get(boards[0].id)
      setBoard(full)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }

  async function addCard(laneId: string) {
    if (!board || !newCardTitle.trim()) return
    try {
      const card = await api.boards.addCard(board.id, { laneId, title: newCardTitle.trim() })
      setBoard({ ...board, cards: [...board.cards, card] })
      setNewCardTitle('')
      setNewCardLane(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add card')
    }
  }

  async function moveCard(cardId: string, toLaneId: string) {
    if (!board) return
    try {
      const updated = await api.boards.moveCard(board.id, cardId, toLaneId)
      setBoard({ ...board, cards: board.cards.map((c) => (c.id === cardId ? updated : c)) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot move card to that lane')
    }
  }

  async function deleteCard(cardId: string) {
    if (!board) return
    await api.boards.deleteCard(board.id, cardId)
    setBoard({ ...board, cards: board.cards.filter((c) => c.id !== cardId) })
  }

  function handleDragStart(card: Card) {
    setDragging({ card, sourceLaneId: card.lane_id })
  }

  function handleDrop(toLaneId: string) {
    if (!dragging) return
    if (dragging.card.lane_id !== toLaneId) {
      moveCard(dragging.card.id, toLaneId)
    }
    setDragging(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><span className="text-sm text-muted">Loading board…</span></div>
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-sm text-muted">No board found.</span>
      </div>
    )
  }

  const lanes: Lane[] = [...board.lanes].sort((a, b) => a.position - b.position)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-3"
        style={{
          background: 'rgba(8, 18, 40, 0.60)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{board.name}</h1>
        {error && <span className="text-xs text-red-400 ml-auto">{error}</span>}
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full" style={{ minWidth: 'max-content' }}>
          {lanes.map((lane) => {
            const cards = board.cards.filter((c) => c.lane_id === lane.id).sort((a, b) => a.position - b.position)
            return (
              <div
                key={lane.id}
                className="w-72 flex flex-col rounded-xl animate-zoom-in"
                style={{
                  background: 'rgba(8, 18, 40, 0.72)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(lane.id)}
              >
                {/* Lane header */}
                <div className="px-3 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{lane.name}</span>
                  <span
                    className="ml-auto text-xs rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--muted)' }}
                  >
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[4rem]">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card)}
                      className="group rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all"
                      style={{
                        background: 'rgba(8, 18, 40, 0.60)',
                        border: '1px solid rgba(255,255,255,0.09)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.35)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
                        <button
                          onClick={() => deleteCard(card.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-opacity flex-shrink-0"
                        >
                          <XIcon />
                        </button>
                      </div>
                      {card.description && (
                        <p className="text-xs text-muted mt-1 line-clamp-2">{card.description}</p>
                      )}
                    </div>
                  ))}
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
                        <button
                          onClick={() => addCard(lane.id)}
                          className="flex-1 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent-hover transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setNewCardLane(null); setNewCardTitle('') }}
                          className="px-2 py-1 text-xs text-muted hover:bg-white/5 rounded-md transition-colors"
                        >
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
        </div>
      </div>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
