import type { MemoryRow, TodoRow, TemplateRow, HumanGateRow } from './db.js'

export type StageStatus = 'pending' | 'in-progress' | 'awaiting-approval' | 'complete' | 'failed' | 'cancelled'

export type GateDecision = {
  action: 'approve' | 'revise' | 'reject'
  feedback?: string
}

export type AppEvent =
  | { type: 'connected' }
  // ── Agent events ────────────────────────────────────────────────────────────
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
  // ── Template events ─────────────────────────────────────────────────────────
  | { type: 'template:installed'; template: TemplateRow }
  | { type: 'template:uninstalled'; templateId: string }
  | { type: 'template:activated'; templateId: string }
  // ── Plugin events ───────────────────────────────────────────────────────────
  | { type: 'plugin:configured'; pluginId: string }
  // ── Pipeline events ─────────────────────────────────────────────────────────
  | { type: 'pipeline:started'; projectId: string }
  | { type: 'pipeline:stage'; projectId: string; stage: string; status: StageStatus }
  | { type: 'pipeline:completed'; projectId: string }
  | { type: 'pipeline:error'; projectId: string; error: string }
  | { type: 'pipeline:paused'; projectId: string }
  // ── Human gate events ───────────────────────────────────────────────────────
  | { type: 'gate:created'; gate: HumanGateRow }
  | { type: 'gate:decided'; gateId: string; decision: GateDecision }

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
