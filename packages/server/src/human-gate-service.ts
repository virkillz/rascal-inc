/**
 * HumanGate — suspend a pipeline at a checkpoint until a human acts in the UI.
 *
 * Usage (inside a PipelineRunner):
 *
 *   const gate = createHumanGate({
 *     id: 'concept-approval',
 *     projectId,
 *     description: 'Review and approve the video concept.',
 *     artifact: conceptJson,
 *     options: ['approve', 'revise', 'reject'],
 *   })
 *   const decision = await gate.wait()
 */

import { randomUUID } from 'crypto'
import { getDb, type HumanGateRow } from './db.js'
import { eventBus, type GateDecision } from './event-bus.js'

export interface HumanGateOptions {
  id: string            // Logical gate ID within the pipeline (e.g. 'concept-approval')
  projectId: string
  description: string
  artifact?: unknown    // Any JSON-serialisable payload surfaced in the UI
  options?: Array<'approve' | 'revise' | 'reject'>
}

export interface HumanGate {
  /** The DB row id (UUID) for this gate instance */
  rowId: string
  /** Suspends until the human makes a decision in the UI */
  wait(): Promise<GateDecision>
}

// Pending resolvers keyed by gate row id
const pending = new Map<string, (decision: GateDecision) => void>()

/** Called by the HTTP API when a human submits a decision */
export function resolveGate(rowId: string, decision: GateDecision): boolean {
  const resolve = pending.get(rowId)
  if (!resolve) return false
  resolve(decision)
  pending.delete(rowId)
  return true
}

export function createHumanGate(opts: HumanGateOptions): HumanGate {
  const db = getDb()
  const rowId = randomUUID()

  db.prepare(`
    INSERT INTO human_gates (id, project_id, gate_id, description, artifact, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(
    rowId,
    opts.projectId,
    opts.id,
    opts.description,
    opts.artifact !== undefined ? JSON.stringify(opts.artifact) : null,
  )

  const row = db.prepare('SELECT * FROM human_gates WHERE id = ?').get(rowId) as HumanGateRow
  eventBus.emit({ type: 'gate:created', gate: row })

  return {
    rowId,
    wait(): Promise<GateDecision> {
      return new Promise<GateDecision>((resolve) => {
        pending.set(rowId, resolve)
      })
    },
  }
}

/** Retrieve all pending gates (e.g. for notification center) */
export function getPendingGates(projectId?: string): HumanGateRow[] {
  const db = getDb()
  if (projectId) {
    return db.prepare(`SELECT * FROM human_gates WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC`)
      .all(projectId) as HumanGateRow[]
  }
  return db.prepare(`SELECT * FROM human_gates WHERE status = 'pending' ORDER BY created_at ASC`)
    .all() as HumanGateRow[]
}
