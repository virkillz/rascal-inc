import { useEffect } from 'react'
import type { AppEvent } from '../types/events.ts'

export function useAppEvents(handler: (event: AppEvent) => void): void {
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)

    ws.onmessage = (e: MessageEvent) => {
      try {
        handler(JSON.parse(e.data as string) as AppEvent)
      } catch { /* ignore malformed */ }
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => ws.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
