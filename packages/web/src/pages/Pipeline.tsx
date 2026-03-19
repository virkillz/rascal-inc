import { useEffect, useState } from 'react'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import type { PipelineProject } from '../api.ts'

const STATUS_COLORS: Record<string, string> = {
  idle:      'text-gray-400 bg-gray-700',
  running:   'text-blue-300 bg-blue-900',
  paused:    'text-yellow-300 bg-yellow-900',
  completed: 'text-green-300 bg-green-900',
  failed:    'text-red-300 bg-red-900',
}

const STAGE_STATUS_DOT: Record<string, string> = {
  'pending':           'bg-gray-600',
  'in-progress':       'bg-blue-500 animate-pulse',
  'awaiting-approval': 'bg-yellow-500 animate-pulse',
  'complete':          'bg-green-500',
  'failed':            'bg-red-500',
  'cancelled':         'bg-gray-500',
}

function ProjectCard({ project }: { project: PipelineProject }) {
  const { startProject, pauseProject } = useStore()
  const [acting, setActing] = useState(false)

  const stages = project.state?.stages ?? {}

  async function handleStart() {
    setActing(true)
    try { await startProject(project.id) } finally { setActing(false) }
  }

  async function handlePause() {
    setActing(true)
    try { await pauseProject(project.id) } finally { setActing(false) }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{project.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Template: {project.template_id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status] ?? STATUS_COLORS.idle}`}>
            {project.status}
          </span>
          {(project.status === 'idle' || project.status === 'paused') && (
            <button
              onClick={handleStart}
              disabled={acting}
              className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors"
            >
              {acting ? '…' : '▶ Start'}
            </button>
          )}
          {project.status === 'running' && (
            <button
              onClick={handlePause}
              disabled={acting}
              className="text-xs px-3 py-1.5 bg-yellow-800 hover:bg-yellow-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {acting ? '…' : '⏸ Pause'}
            </button>
          )}
        </div>
      </div>

      {/* Stage tracker */}
      {Object.keys(stages).length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(stages).map(([stage, status]) => (
            <div key={stage} className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STAGE_STATUS_DOT[status] ?? 'bg-gray-600'}`} />
              <span className="text-gray-300 capitalize">{stage.replace(/-/g, ' ')}</span>
              <span className="text-gray-500">{status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Waiting for gate */}
      {project.state?.waitingForGate && (
        <div className="mt-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-xs text-amber-300">
          ⏳ Waiting for approval: {project.state.waitingForGate.description}
        </div>
      )}

      {/* Errors */}
      {(project.state?.errors ?? []).length > 0 && (
        <div className="mt-3 space-y-1">
          {project.state.errors.map((e, i) => (
            <div key={i} className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
              {e.stage && <span className="font-medium">[{e.stage}] </span>}{e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Pipeline() {
  const { projects, templates, loadProjects, createProject, deleteProject } = useStore()
  const [newProjectTemplateId, setNewProjectTemplateId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Refresh projects on pipeline events
  useAppEvents((event) => {
    if (
      event.type === 'pipeline:started' ||
      event.type === 'pipeline:stage' ||
      event.type === 'pipeline:completed' ||
      event.type === 'pipeline:error' ||
      event.type === 'pipeline:paused'
    ) {
      loadProjects()
    }
  })

  const activeTemplate = templates.find(t => t.isActive)

  async function handleCreate() {
    const templateId = newProjectTemplateId || activeTemplate?.id
    if (!templateId) return
    setCreating(true)
    try {
      await createProject({ templateId, name: newProjectName || undefined })
      setNewProjectName('')
      setNewProjectTemplateId('')
    } finally {
      setCreating(false)
    }
  }

  const running = projects.filter(p => p.status === 'running' || p.status === 'paused')
  const done = projects.filter(p => p.status === 'completed' || p.status === 'failed')
  const idle = projects.filter(p => p.status === 'idle')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Pipeline</h1>
      <p className="text-sm text-gray-400 mb-6">
        Start and manage template pipeline projects.
      </p>

      {/* New project */}
      {templates.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-8">
          <h2 className="font-semibold mb-3">New project</h2>
          <div className="flex gap-2">
            {templates.length > 1 && (
              <select
                className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                value={newProjectTemplateId}
                onChange={e => setNewProjectTemplateId(e.target.value)}
              >
                <option value="">— pick template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
            )}
            <input
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              placeholder="Project name (optional)"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || (!newProjectTemplateId && !activeTemplate)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
          {!activeTemplate && templates.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">Install and activate a template first.</p>
          )}
        </div>
      )}

      {templates.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🚀</p>
          <p>No templates installed.</p>
          <p className="text-sm mt-1">Install a template from the Templates page to start a pipeline.</p>
        </div>
      )}

      {running.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Active</h2>
          <div className="space-y-3">{running.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </div>
      )}

      {idle.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Ready</h2>
          <div className="space-y-3">{idle.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">History</h2>
          <div className="space-y-3">{done.map(p => (
            <div key={p.id} className="relative">
              <ProjectCard project={p} />
              <button
                onClick={() => deleteProject(p.id)}
                className="absolute top-3 right-3 text-xs text-gray-600 hover:text-red-400 transition-colors"
                title="Remove"
              >✕</button>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  )
}
