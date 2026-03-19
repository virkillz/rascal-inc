import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store.ts'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import Onboarding from './pages/Onboarding.tsx'
import Roster from './pages/Roster.tsx'
import AgentChat from './pages/AgentChat.tsx'
import Settings from './pages/Settings.tsx'
import Layout from './components/Layout.tsx'

export default function App() {
  const { settings, loadSettings } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings().finally(() => setLoading(false))
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

  if (settings?.firstRun) {
    return (
      <ThemeProvider>
        <Onboarding onComplete={() => loadSettings()} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/roster" replace />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/agents/:id" element={<AgentChat />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
