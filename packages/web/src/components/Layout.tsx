import { Outlet, NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store.ts'
import { useTheme } from '../contexts/ThemeContext.tsx'

export default function Layout() {
  const { settings, agents, loadAgents } = useStore()
  const { theme, toggle } = useTheme()

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  return (
    <div className="flex h-full bg-surface-0">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
        {/* Company header */}
        <div className="px-4 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">R</span>
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {settings?.companyName || 'My Company'}
              </div>
              <div className="text-[10px] text-muted">rascal-inc</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-3 mb-1 space-y-0.5">
            <NavLink
              to="/roster"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-surface-3' : 'hover:bg-surface-2'
                }`
              }
              style={({ isActive }) => ({ color: isActive ? 'var(--text-primary)' : 'var(--muted)' })}
            >
              <GridIcon />
              <span>Roster</span>
            </NavLink>
            <NavLink
              to="/workspace"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-surface-3' : 'hover:bg-surface-2'
                }`
              }
              style={({ isActive }) => ({ color: isActive ? 'var(--text-primary)' : 'var(--muted)' })}
            >
              <FolderIcon />
              <span>Workspace</span>
            </NavLink>
          </div>

          {agents.length > 0 && (
            <>
              <div className="px-5 py-2 text-[10px] font-medium text-muted uppercase tracking-wider mt-1">
                Employees
              </div>
              {agents.map((agent) => (
                <div key={agent.id} className="px-3">
                  <NavLink
                    to={`/agents/${agent.id}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        isActive ? 'bg-surface-3' : 'hover:bg-surface-2'
                      }`
                    }
                    style={({ isActive }) => ({ color: isActive ? 'var(--text-primary)' : 'var(--muted)' })}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: agent.avatar_color }}
                    >
                      {agent.name[0].toUpperCase()}
                    </div>
                    <span className="truncate">{agent.name}</span>
                  </NavLink>
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Bottom links */}
        <div className="px-3 py-3 border-t border-border flex items-center gap-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-surface-3' : 'hover:bg-surface-2'
              }`
            }
            style={({ isActive }) => ({ color: isActive ? 'var(--text-primary)' : 'var(--muted)' })}
          >
            <CogIcon />
            <span>Settings</span>
          </NavLink>

          <button
            onClick={toggle}
            className="flex-shrink-0 w-8 h-8 rounded-lg hover:bg-surface-2 flex items-center justify-center transition-colors"
            style={{ color: 'var(--muted)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

function GridIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zm9.75-9.75A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zm0 9.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function CogIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  )
}
