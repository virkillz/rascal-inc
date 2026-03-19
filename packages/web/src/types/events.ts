export type AppEvent =
  | { type: 'connected' }
  | { type: 'agent:thinking'; agentId: string }
  | { type: 'agent:reply'; agentId: string; preview: string }
  | { type: 'agent:idle'; agentId: string }
  | { type: 'agent:error'; agentId: string; error: string }
  | { type: 'todo:created'; agentId: string; todo: object }
  | { type: 'todo:updated'; agentId: string; todo: object }
  | { type: 'todo:deleted'; agentId: string; todoId: number }
  | { type: 'memory:created'; agentId: string; entry: object }
  | { type: 'memory:deleted'; agentId: string; entryId: number }
  | { type: 'schedule:fired'; agentId: string; scheduleId: number; label: string }
  | { type: 'workspace:change'; path: string; action: 'created' | 'updated' | 'deleted' }
