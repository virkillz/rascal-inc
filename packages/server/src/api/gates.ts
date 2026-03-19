import { Router } from 'express'
import { getDb, type HumanGateRow } from '../db.js'
import { eventBus, type GateDecision } from '../event-bus.js'
import { resolveGate, getPendingGates } from '../human-gate-service.js'

function rowToGate(row: HumanGateRow) {
  return {
    ...row,
    artifact: row.artifact ? JSON.parse(row.artifact) : null,
    decision: row.decision ? JSON.parse(row.decision) : null,
  }
}

export function createGatesRouter(): Router {
  const router = Router()

  // GET /api/gates?status=pending|all
  router.get('/', (req, res) => {
    const status = (req.query.status as string) ?? 'pending'
    const db = getDb()
    let rows: HumanGateRow[]
    if (status === 'all') {
      rows = db.prepare('SELECT * FROM human_gates ORDER BY created_at DESC').all() as HumanGateRow[]
    } else {
      rows = getPendingGates() as HumanGateRow[]
    }
    res.json(rows.map(rowToGate))
  })

  // GET /api/gates/project/:projectId
  router.get('/project/:projectId', (req, res) => {
    const rows = getDb()
      .prepare(`SELECT * FROM human_gates WHERE project_id = ? ORDER BY created_at ASC`)
      .all(req.params.projectId) as HumanGateRow[]
    res.json(rows.map(rowToGate))
  })

  // POST /api/gates/:id/decide  — body: { action, feedback? }
  router.post('/:id/decide', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM human_gates WHERE id = ?').get(req.params.id) as HumanGateRow | undefined
    if (!row) return res.status(404).json({ error: 'Gate not found' })
    if (row.status !== 'pending') return res.status(409).json({ error: 'Gate already decided' })

    const { action, feedback } = req.body as { action?: string; feedback?: string }
    if (!['approve', 'revise', 'reject'].includes(action ?? '')) {
      return res.status(400).json({ error: '"action" must be approve | revise | reject' })
    }

    const decision: GateDecision = { action: action as GateDecision['action'], feedback }

    db.prepare(`
      UPDATE human_gates SET status = 'decided', decision = ?, decided_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify(decision), row.id)

    // Wake the suspended PipelineRunner
    const resolved = resolveGate(row.id, decision)

    eventBus.emit({ type: 'gate:decided', gateId: row.id, decision })

    res.json({ ok: true, resolved })
  })

  return router
}
