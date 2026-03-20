import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store.ts'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { api, type User } from './api.ts'
import Onboarding from './pages/Onboarding.tsx'
import Login from './pages/Login.tsx'
import Roster from './pages/Roster.tsx'
import AgentChat from './pages/AgentChat.tsx'
import Settings from './pages/Settings.tsx'
import Workspace from './pages/Workspace.tsx'
import Plugins from './pages/Plugins.tsx'
import Skills from './pages/Skills.tsx'
import Board from './pages/Board.tsx'
import Channels from './pages/Channels.tsx'
import Roles from './pages/Roles.tsx'
import Layout from './components/Layout.tsx'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  const { settings, loadSettings } = useStore()
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  useEffect(() => {
    loadSettings()
      .then(() => api.auth.me())
      .then((user) => {
        setCurrentUser(user)
        setAuthState('authenticated')
      })
      .catch(() => {
        setAuthState('unauthenticated')
      })
      .finally(() => setLoading(false))
  }, [loadSettings])

  if (loading) {
    return (
      <ThemeProvider>
        <div className="flex items-center justify-center h-full" style={{ background: 'rgb(var(--s0))' }}>
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-10 h-10 rounded flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }}
              />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Initializing
            </span>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // First-run setup wizard (no company name set OR no users exist yet)
  if (settings?.firstRun || settings?.needsSetup) {
    return (
      <ThemeProvider>
        <Onboarding
          onComplete={() => loadSettings()}
          startAtAccount={!settings.firstRun && settings.needsSetup}
        />
      </ThemeProvider>
    )
  }

  // Login gate
  if (authState === 'unauthenticated') {
    return (
      <ThemeProvider>
        <Login onLogin={(user) => { setCurrentUser(user); setAuthState('authenticated') }} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAuthState('unauthenticated') }} />}>
            <Route index element={<Navigate to="/channels" replace />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/:id" element={<Channels />} />
            <Route path="/board" element={<Board />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/agents/:id" element={<AgentChat />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/plugins" element={<Plugins />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
