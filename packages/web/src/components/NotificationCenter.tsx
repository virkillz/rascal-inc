import { useRef, useState } from 'react'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { useStore } from '../store.ts'

interface Notification {
  id: string
  message: string
  type: 'agent' | 'board' | 'schedule' | 'error'
  at: Date
}

let _idCounter = 0
function nextId() { return String(++_idCounter) }

export default function NotificationCenter() {
  const { agents, loadSchedules } = useStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function agentName(id: string) {
    return agents.find((a) => a.id === id)?.name ?? id
  }

  function push(n: Omit<Notification, 'id' | 'at'>) {
    setNotifications((prev) => [{ ...n, id: nextId(), at: new Date() }, ...prev].slice(0, 30))
  }

  useAppEvents((event) => {
    if (event.type === 'agent:error') {
      push({ message: `${agentName(event.agentId)}: ${event.error}`, type: 'error' })
    } else if (event.type === 'schedule:fired') {
      push({ message: `Schedule fired for ${agentName(event.agentId)}: ${event.label || 'unnamed'}`, type: 'schedule' })
    } else if (event.type === 'schedule:created') {
      loadSchedules(event.agentId)
      push({ message: `${agentName(event.agentId)} created schedule: ${event.label || 'unnamed'}`, type: 'schedule' })
    } else if (event.type === 'board:card_moved') {
      push({ message: `Card moved: "${event.title}"`, type: 'board' })
    }
  })

  // Close on outside click
  useRef(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  })

  const unread = notifications.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition-colors"
        style={{ color: 'var(--muted)' }}
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {Math.min(unread, 9)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-72 bg-surface-1 border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="text-[10px] text-muted hover:text-accent transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="px-4 py-2.5 border-b border-border last:border-0">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {n.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
