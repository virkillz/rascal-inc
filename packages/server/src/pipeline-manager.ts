/**
 * PipelineManager — manages PipelineRunner instances for active projects.
 *
 * Templates implement PipelineRunner and register it here. The platform then
 * calls start/pause/resume/getState without knowing the template's internals.
 *
 * Templates register their runner factory via:
 *   pipelineManager.registerTemplate('render-rascals', () => new RenderRascalsPipeline())
 */

import { getDb, type PipelineProjectRow } from './db.js'
import { eventBus } from './event-bus.js'
import type { StageStatus, GateDecision } from './event-bus.js'

// ── Public interfaces (mirrors PLAN.md) ───────────────────────────────────────

export interface PipelineError {
  stage?: string
  message: string
  timestamp: string
}

export interface PipelineState {
  projectId: string
  currentStage: string
  stages: Record<string, StageStatus>
  activeAgentId?: string
  errors: PipelineError[]
  waitingForGate?: { gateId: string; description: string }
}

export interface PipelineRunner {
  start(projectId: string, input: unknown): Promise<void>
  resume(projectId: string, gateId: string, decision: GateDecision): Promise<void>
  pause(projectId: string): Promise<void>
  getState(projectId: string): Promise<PipelineState>
}

export type RunnerFactory = () => PipelineRunner

// ── Manager ───────────────────────────────────────────────────────────────────

class PipelineManager {
  /** Registered runner factories keyed by templateId */
  private factories = new Map<string, RunnerFactory>()
  /** Live runner instances keyed by projectId */
  private runners = new Map<string, PipelineRunner>()

  registerTemplate(templateId: string, factory: RunnerFactory) {
    this.factories.set(templateId, factory)
  }

  private getOrCreateRunner(templateId: string, projectId: string): PipelineRunner {
    if (this.runners.has(projectId)) return this.runners.get(projectId)!
    const factory = this.factories.get(templateId)
    if (!factory) {
      throw new Error(`No runner registered for template "${templateId}"`)
    }
    const runner = factory()
    this.runners.set(projectId, runner)
    return runner
  }

  async start(projectId: string, input: unknown): Promise<void> {
    const db = getDb()
    const project = db.prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(projectId) as PipelineProjectRow | undefined
    if (!project) throw new Error(`Project "${projectId}" not found`)

    db.prepare(`UPDATE pipeline_projects SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(projectId)
    eventBus.emit({ type: 'pipeline:started', projectId })

    const runner = this.getOrCreateRunner(project.template_id, projectId)
    runner.start(projectId, input).then(async () => {
      const state = await runner.getState(projectId)
      db.prepare(`UPDATE pipeline_projects SET status = 'completed', state = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(state), projectId)
      eventBus.emit({ type: 'pipeline:completed', projectId })
    }).catch((err: Error) => {
      db.prepare(`UPDATE pipeline_projects SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(projectId)
      eventBus.emit({ type: 'pipeline:error', projectId, error: err.message })
    })
  }

  async pause(projectId: string): Promise<void> {
    const runner = this.runners.get(projectId)
    if (!runner) return
    await runner.pause(projectId)
    getDb().prepare(`UPDATE pipeline_projects SET status = 'paused', updated_at = datetime('now') WHERE id = ?`).run(projectId)
    eventBus.emit({ type: 'pipeline:paused', projectId })
  }

  async resume(projectId: string, gateId: string, decision: GateDecision): Promise<void> {
    const db = getDb()
    const project = db.prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(projectId) as PipelineProjectRow | undefined
    if (!project) throw new Error(`Project "${projectId}" not found`)
    const runner = this.getOrCreateRunner(project.template_id, projectId)
    db.prepare(`UPDATE pipeline_projects SET status = 'running', updated_at = datetime('now') WHERE id = ?`).run(projectId)
    await runner.resume(projectId, gateId, decision)
  }

  async getState(projectId: string): Promise<PipelineState | null> {
    const runner = this.runners.get(projectId)
    if (!runner) {
      const row = getDb().prepare('SELECT * FROM pipeline_projects WHERE id = ?').get(projectId) as PipelineProjectRow | undefined
      if (!row) return null
      return JSON.parse(row.state) as PipelineState
    }
    return runner.getState(projectId)
  }

  deleteRunner(projectId: string) {
    this.runners.delete(projectId)
  }
}

export const pipelineManager = new PipelineManager()
