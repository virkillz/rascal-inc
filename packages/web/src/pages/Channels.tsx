import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Channel, type ChannelMessage, type Agent } from '../api.ts'
import { useStore } from '../store.ts'

export default function Channels() {
  const { id: paramId } = useParams<{ id?: string }>()
  const { agents } = useStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadChannels()
  }, [])

  useEffect(() => {
    if (activeChannel) loadMessages(activeChannel.id)
  }, [activeChannel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Subscribe to WS channel:message events
  useEffect(() => {
    function handler(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'channel:message' && data.channelId === activeChannel?.id) {
          setMessages((prev) => [
            ...prev,
            {
              id: data.messageId,
              channel_id: data.channelId,
              sender_id: data.senderId,
              sender_type: data.senderType,
              content: data.content,
              created_at: new Date().toISOString(),
            },
          ])
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('ws:message', handler as EventListener)
    return () => window.removeEventListener('ws:message', handler as EventListener)
  }, [activeChannel])

  async function loadChannels() {
    const list = await api.channels.list()
    setChannels(list)
    if (list.length > 0) {
      const target = paramId ? list.find((c) => c.id === paramId) ?? list[0] : list[0]
      setActiveChannel(target)
    }
  }

  async function loadMessages(channelId: string) {
    const msgs = await api.channels.messages(channelId)
    setMessages(msgs)
  }

  async function sendMessage() {
    if (!activeChannel || !input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    try {
      await api.channels.send(activeChannel.id, content)
      // Optimistic: message will arrive via WS or re-load
    } catch (err) {
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  function agentById(id: string): Agent | undefined {
    return agents.find((a) => a.id === id)
  }

  function senderName(msg: ChannelMessage): string {
    if (msg.sender_type === 'agent') {
      return agentById(msg.sender_id)?.name ?? msg.sender_id
    }
    return msg.sender_id // user display_name would need a user lookup; simplified here
  }

  function senderColor(msg: ChannelMessage): string {
    if (msg.sender_type === 'agent') {
      return agentById(msg.sender_id)?.avatar_color ?? '#7c6af7'
    }
    return '#6ac5f7'
  }

  return (
    <div className="flex h-full">
      {/* Channel list sidebar */}
      <div
        className="w-48 flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(8, 18, 40, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Channels</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                activeChannel?.id === ch.id ? 'bg-white/[0.08]' : 'hover:bg-white/5'
              }`}
              style={{ color: activeChannel?.id === ch.id ? 'var(--text-primary)' : 'var(--muted)' }}
            >
              <span style={{ color: 'var(--muted)' }}>#</span>
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div
              className="px-5 py-3.5 flex items-center gap-2"
              style={{
                background: 'rgba(8, 18, 40, 0.60)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span className="text-muted text-sm">#</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{activeChannel.name}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                    style={{ backgroundColor: senderColor(msg) }}
                  >
                    {senderName(msg)[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {senderName(msg)}
                      </span>
                      {msg.sender_type === 'agent' && (
                        <span
                          className="text-[10px] rounded px-1"
                          style={{ background: 'rgba(245,158,11,0.15)', color: 'rgb(var(--accent))' }}
                        >
                          AI
                        </span>
                      )}
                      <span className="text-[10px] text-muted">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--subtle)' }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="px-5 py-4"
              style={{
                background: 'rgba(8, 18, 40, 0.60)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="flex items-end gap-3 rounded-xl px-3 py-2"
                style={{
                  background: 'rgba(8, 18, 40, 0.70)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder={`Message #${activeChannel.name} — use @name to mention an agent`}
                  rows={1}
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none"
                  style={{ color: 'var(--text-primary)', minHeight: '1.5rem', maxHeight: '8rem' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-8 h-8 bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted">Select a channel</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  )
}
