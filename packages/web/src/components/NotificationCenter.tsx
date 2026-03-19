import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import type { HumanGate } from '../api.ts'

function GateCard({ gate }: { gate: HumanGate }) {
  const { decideGate } = useStore()
  const [feedback, setFeedback] = useState('')
  const [deciding, setDeciding] = useState<string | null>(null)

  async function decide(action: 'approve' | 'revise' | 'reject') {
    setDeciding(action)
    try {
      await decideGate(gate.id, action, feedback || undefined)
    } finally {
      setDeciding(null)
    }
  }

  return (
    <div className="bg-gray-800 border border-amber-700/50 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs text-amber-400 font-medium uppercase tracking-wider mb-1">Awaiting decision</p>
        <p className="text-sm font-medium">{gate.description}</p>
        <p className="text-xs text-gray-500 mt-0.5">Gate: {gate.gate_id}</p>
      </div>

      {gate.artifact && (
        <details className="text-xs">
          <summary className="text-gray-400 cursor-pointer hover:text-gray-300">View artifact</summary>
          <pre className="mt-2 bg-gray-900 rounded-lg p-3 overflow-auto max-h-48 text-gray-300 whitespace-pre-wrap">
            {JSON.stringify(gate.artifact, null, 2)}
          </pre>
        </details>
      )}

      <textarea
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-500 placeholder-gray-600"
        rows={2}
        placeholder="Optional feedback…"
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
      />

      <div className="flex gap-2">
        <button
          onClick={() => decide('approve')}
          disabled={!!deciding}
          className="flex-1 py-1.5 text-sm bg-green-800 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {deciding === 'approve' ? '…' : '✓ Approve'}
        </button>
        <button
          onClick={() => decide('revise')}
          disabled={!!deciding}
          className="flex-1 py-1.5 text-sm bg-yellow-800 hover:bg-yellow-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {deciding === 'revise' ? '…' : '↩ Revise'}
        </button>
        <button
          onClick={() => decide('reject')}
          disabled={!!deciding}
          className="flex-1 py-1.5 text-sm bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg transition-colors"
        >
          {deciding === 'reject' ? '…' : '✕ Reject'}
        </button>
      </div>
    </div>
  )
}

export default function NotificationCenter() {
  const { gates, loadGates } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { loadGates() }, [loadGates])

  // Refresh gates on relevant WS events
  useAppEvents((event) => {
    if (event.type === 'gate:created' || event.type === 'gate:decided') {
      loadGates()
    }
  })

  // Close on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  const pendingCount = gates.filter(g => g.status === 'pending').length
  const pending = gates.filter(g => g.status === 'pending')

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-700 transition-colors"
        title="Notifications"
      >
        <span className="text-lg">🔔</span>
        {pendingCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-850 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="font-semibold text-sm">Notifications</span>
            {pendingCount > 0 && (
              <span className="text-xs text-amber-400">{pendingCount} pending</span>
            )}
          </div>
          <div className="max-h-[480px] overflow-y-auto p-3 space-y-3">
            {pending.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">No pending decisions</p>
            ) : (
              pending.map(g => <GateCard key={g.id} gate={g} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
