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
        <div className="flex items-center justify-center h-full bg-surface-0">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted">Loading...</span>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // First-run setup wizard (no users exist yet)
  if (settings?.firstRun) {
    return (
      <ThemeProvider>
        <Onboarding onComplete={() => loadSettings()} />
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
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
