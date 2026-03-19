import { useState } from 'react'
import { api, type Provider } from '../api.ts'
import { useStore } from '../store.ts'

type Step = 'company' | 'provider' | 'start'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('company')
  const [companyName, setCompanyName] = useState('')
  const [companyMission, setCompanyMission] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { updateSettings } = useStore()

  async function handleCompanyContinue() {
    if (!companyName.trim()) { setError('Company name is required'); return }
    setSaving(true)
    setError('')
    try {
      await updateSettings({ companyName: companyName.trim(), companyMission: companyMission.trim() })
      const list = await api.settings.providers()
      setProviders(list)
      setStep('provider')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveProvider() {
    if (!apiKey.trim()) { setError('API key required'); return }
    setSaving(true)
    setError('')
    try {
      await api.settings.saveProviderKey(selectedProvider, apiKey.trim())
      setStep('start')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const recommended = providers.find((p) => p.recommended)
  const others = providers.filter((p) => !p.recommended)

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-white font-semibold text-lg">rascal-inc</span>
          </div>
          <p className="text-muted text-sm">virtual company platform</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['company', 'provider', 'start'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${
                s === step ? 'bg-accent' : steps_done(s, step) ? 'bg-accent/40' : 'bg-surface-3'
              }`} />
              {i < 2 && <div className="w-6 h-px bg-surface-3" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Company ── */}
        {step === 'company' && (
          <div className="card p-6 space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Your company</h1>
              <p className="text-sm text-muted mt-1">Give your virtual company a name and purpose.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Company name *</label>
                <input
                  className="input"
                  placeholder="Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCompanyContinue()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Mission <span className="text-muted font-normal">(optional)</span></label>
                <textarea
                  className="input resize-none h-20"
                  placeholder="What does your company do?"
                  value={companyMission}
                  onChange={(e) => setCompanyMission(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button className="btn-primary w-full" onClick={handleCompanyContinue} disabled={saving}>
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        {/* ── Step 2: Provider ── */}
        {step === 'provider' && (
          <div className="card p-6 space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Connect a provider</h1>
              <p className="text-sm text-muted mt-1">Your agents need an LLM provider to think.</p>
            </div>

            {recommended && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">Recommended</span>
                  <span className="text-sm font-medium text-white">{recommended.label}</span>
                </div>
                <p className="text-xs text-muted">One API key gives access to 240+ models from every major lab.</p>
                {selectedProvider === recommended.id && (
                  <div>
                    <input
                      className="input text-xs"
                      type="password"
                      placeholder="sk-or-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )}

            {/* Other providers collapsible */}
            <details className="group">
              <summary className="text-xs text-muted cursor-pointer hover:text-subtle list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Use a different provider
              </summary>
              <div className="mt-3 space-y-2">
                {others.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProvider(p.id); setApiKey('') }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                      selectedProvider === p.id
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-border bg-surface-2 text-subtle hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {selectedProvider !== 'openrouter' && (
                  <input
                    className="input text-xs mt-2"
                    type="password"
                    placeholder="API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            </details>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1 text-center"
                onClick={() => setStep('start')}
              >
                Skip for now
              </button>
              <button className="btn-primary flex-1" onClick={handleSaveProvider} disabled={saving}>
                {saving ? 'Saving...' : 'Save & continue'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: How to start ── */}
        {step === 'start' && (
          <div className="card p-6 space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-white">How do you want to start?</h1>
              <p className="text-sm text-muted mt-1">You can always change this later.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="relative border border-border rounded-xl p-4 text-left opacity-40 cursor-not-allowed"
                disabled
              >
                <div className="text-sm font-medium text-white mb-1">Install a template</div>
                <div className="text-xs text-muted">Video team, blog team, and more.</div>
                <div className="absolute top-2 right-2 text-[10px] bg-surface-3 text-muted px-1.5 py-0.5 rounded-full">
                  soon
                </div>
              </button>

              <button
                className="border border-accent/40 bg-accent/5 hover:bg-accent/10 rounded-xl p-4 text-left transition-colors"
                onClick={onComplete}
              >
                <div className="text-sm font-medium text-white mb-1">Build your team</div>
                <div className="text-xs text-muted">Create agents manually.</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function steps_done(s: Step, current: Step): boolean {
  const order: Step[] = ['company', 'provider', 'start']
  return order.indexOf(s) < order.indexOf(current)
}
