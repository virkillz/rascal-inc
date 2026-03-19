import { useEffect, useState } from 'react'
import { useStore } from '../store.ts'
import type { Template } from '../api.ts'

export default function Templates() {
  const { templates, loadTemplates, activateTemplate, uninstallTemplate } = useStore()
  const [installDir, setInstallDir] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState<Template | null>(null)

  useEffect(() => { loadTemplates() }, [loadTemplates])

  async function handleInstall() {
    if (!installDir.trim()) return
    setInstalling(true)
    setInstallError('')
    try {
      await useStore.getState().installTemplate(installDir.trim())
      setInstallDir('')
    } catch (err) {
      setInstallError((err as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  async function handleActivate(id: string) {
    await activateTemplate(id)
  }

  async function handleUninstall(t: Template) {
    setUninstalling(t.id)
    try {
      await uninstallTemplate(t.id)
    } finally {
      setUninstalling(null)
      setConfirmUninstall(null)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Templates</h1>
      <p className="text-sm text-gray-400 mb-6">
        Install domain-specific agent teams and pipelines. One template can be active at a time.
      </p>

      {/* Install panel */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-8">
        <h2 className="font-semibold mb-3">Install from directory</h2>
        <p className="text-xs text-gray-400 mb-3">
          Provide the absolute path to a directory that contains a <code className="text-purple-400">template.json</code>.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            placeholder="/path/to/render-rascals"
            value={installDir}
            onChange={e => setInstallDir(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInstall()}
          />
          <button
            onClick={handleInstall}
            disabled={installing || !installDir.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
        {installError && (
          <p className="text-red-400 text-xs mt-2">{installError}</p>
        )}
      </div>

      {/* Installed templates */}
      <h2 className="font-semibold mb-3 text-gray-300">Installed templates</h2>

      {templates.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📦</p>
          <p>No templates installed yet.</p>
          <p className="text-sm mt-1">Install one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div
              key={t.id}
              className={`bg-gray-800 border rounded-xl p-5 transition-colors ${
                t.isActive ? 'border-purple-500' : 'border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{t.display_name}</h3>
                    <span className="text-xs text-gray-500">v{t.version}</span>
                    {t.isActive && (
                      <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-sm text-gray-400 mb-2">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{t.manifest.agents.length} agent{t.manifest.agents.length !== 1 ? 's' : ''}</span>
                    {t.manifest.requiredPlugins.length > 0 && (
                      <span>· requires: {t.manifest.requiredPlugins.join(', ')}</span>
                    )}
                    {t.manifest.pipeline && (
                      <span>· pipeline: {t.manifest.pipeline.type}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!t.isActive && (
                    <button
                      onClick={() => handleActivate(t.id)}
                      className="text-sm px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmUninstall(t)}
                    className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-red-900 hover:text-red-300 rounded-lg transition-colors"
                  >
                    Uninstall
                  </button>
                </div>
              </div>

              {/* Agent list */}
              <div className="mt-3 pt-3 border-t border-gray-700 flex flex-wrap gap-2">
                {t.manifest.agents.map(a => (
                  <span
                    key={a.id}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full"
                  >
                    {a.name} · {a.role}
                    {a.isPipelineController && ' ★'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uninstall confirmation modal */}
      {confirmUninstall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold mb-2">Uninstall {confirmUninstall.display_name}?</h3>
            <p className="text-sm text-gray-400 mb-5">
              This will remove all template agents from the roster. Project data in the workspace is preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmUninstall(null)}
                className="px-4 py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUninstall(confirmUninstall)}
                disabled={uninstalling === confirmUninstall.id}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
              >
                {uninstalling === confirmUninstall.id ? 'Removing…' : 'Uninstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
