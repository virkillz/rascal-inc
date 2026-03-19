import type { MemoryRow, TodoRow } from './db.js'

export type AppEvent =
  | { type: 'connected' }
  | { type: 'agent:thinking'; agentId: string }
  | { type: 'agent:reply'; agentId: string; preview: string }
  | { type: 'agent:idle'; agentId: string }
  | { type: 'agent:error'; agentId: string; error: string }
  | { type: 'todo:created'; agentId: string; todo: TodoRow }
  | { type: 'todo:updated'; agentId: string; todo: TodoRow }
  | { type: 'todo:deleted'; agentId: string; todoId: number }
  | { type: 'memory:created'; agentId: string; entry: MemoryRow }
  | { type: 'memory:deleted'; agentId: string; entryId: number }
  | { type: 'schedule:fired'; agentId: string; scheduleId: number; label: string }
  | { type: 'workspace:change'; path: string; action: 'created' | 'updated' | 'deleted' }

type Handler = (event: AppEvent) => void

class EventBus {
  private handlers: Handler[] = []

  emit(event: AppEvent): void {
    for (const h of this.handlers) h(event)
  }

  on(handler: Handler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }
}

export const eventBus = new EventBus()
