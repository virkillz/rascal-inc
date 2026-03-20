import { Outlet, NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store.ts'
import { useTheme } from '../contexts/ThemeContext.tsx'
import { api, type User } from '../api.ts'

interface LayoutProps {
  currentUser: User | null
  onLogout: () => void
}

export default function Layout({ currentUser, onLogout }: LayoutProps) {
  const { settings, agents, loadAgents, agentStatus } = useStore()
  const { theme, toggle } = useTheme()

  useEffect(() => { loadAgents() }, [loadAgents])

  function handleLogout() {
    api.auth.logout().finally(onLogout)
  }

  const thinkingCount = Object.values(agentStatus).filter(s => s === 'thinking').length
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  const year = now.getFullYear()

  return (
    <div className="flex flex-col h-full">

      {/* ── HUD Top Bar ── */}
      <header
        className="glass flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: '52px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgb(var(--accent))' }}
          >
            <BarChartIcon />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {settings?.companyName || 'Rascal Inc'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
              Command Center
            </span>
          </div>
        </div>

        {/* HUD Stats */}
        <div className="flex items-center">
          <HudStat icon={<StaffIcon />} label="Staff" value={String(agents.length)} />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <HudStat
            icon={<BoltIcon />}
            label="Working"
            value={String(thinkingCount)}
            highlight={thinkingCount > 0}
          />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <HudStat icon={<ClockIcon />} label="Period" value={`Q${quarter} ${year}`} />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <button
            onClick={toggle}
            className="w-7 h-7 ml-2 rounded flex items-center justify-center transition-colors hover:bg-surface-3"
            style={{ color: 'var(--muted)' }}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ── Body: Sidebar + Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className="glass flex-shrink-0 flex flex-col"
          style={{ width: '200px', borderRight: '1px solid rgba(255,255,255,0.10)' }}
        >
          {/* Main Navigation */}
          <nav className="flex-1 py-3 overflow-y-auto">
            <div className="px-3 space-y-0.5">
              <GameNavLink to="/channels" icon={<MessagesIcon />} label="Messages" />
              <GameNavLink to="/board" icon={<TasksIcon />} label="Tasks" />
              <GameNavLink to="/roster" icon={<EmployeesIcon />} label="Employees" />
              <GameNavLink to="/workspace" icon={<FilesIcon />} label="Workspace" />
            </div>

            {/* Agent quick-links */}
            {agents.length > 0 && (
              <>
                <div
                  className="px-5 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--muted)' }}
                >
                  Agents
                </div>
                {agents.map((agent) => (
                  <div key={agent.id} className="px-3">
                    <NavLink
                      to={`/agents/${agent.id}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all ${
                          isActive ? '' : 'hover:bg-white/5'
                        }`
                      }
                      style={({ isActive }) => ({
                        color: isActive ? 'var(--text-primary)' : 'var(--subtle)',
                        background: isActive ? 'rgba(245,158,11,0.08)' : undefined,
                        borderLeft: `2px solid ${isActive ? 'rgb(var(--accent))' : 'transparent'}`,
                        opacity: !agent.is_active && !isActive ? 0.5 : 1,
                      })}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white relative overflow-hidden"
                        style={{ backgroundColor: agent.avatar_color }}
                      >
                        {agent.avatar_url
                          ? <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                          : agent.name[0].toUpperCase()
                        }
                        {agentStatus[agent.id] === 'thinking' && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse-dot"
                            style={{ background: 'var(--status-green)', border: '1.5px solid rgb(var(--s1))' }}
                          />
                        )}
                      </div>
                      <span className="truncate">{agent.name}</span>
                    </NavLink>
                  </div>
                ))}
              </>
            )}
          </nav>

          {/* Bottom: admin + user */}
          <div className="px-3 py-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <GameNavLink to="/settings" icon={<CogIcon />} label="Settings" />
            <div className="flex items-center gap-2 px-3 py-2 mt-1">
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: currentUser?.avatar_color ?? 'rgb(var(--accent))', color: '#0a0f1a' }}
              >
                {(currentUser?.display_name ?? '?')[0].toUpperCase()}
              </div>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--subtle)' }}>
                {currentUser?.display_name ?? ''}
              </span>
              <button
                onClick={handleLogout}
                className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-surface-3"
                style={{ color: 'var(--muted)' }}
                title="Log out"
              >
                <LogoutIcon />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GameNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all ${
          isActive ? '' : 'hover:bg-white/5'
        }`
      }
      style={({ isActive }) => ({
        color: isActive ? 'var(--text-primary)' : 'var(--subtle)',
        background: isActive ? 'rgba(245,158,11,0.12)' : undefined,
        borderLeft: `2px solid ${isActive ? 'rgb(var(--accent))' : 'transparent'}`,
      })}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      {label}
    </NavLink>
  )
}

function HudStat({ icon, label, value, highlight }: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-4">
      <span className="w-4 h-4 flex-shrink-0" style={{ color: highlight ? 'var(--status-green)' : 'var(--muted)' }}>
        {icon}
      </span>
      <div>
        <div className="hud-stat-label">{label}</div>
        <div className="hud-stat-value" style={{ color: highlight ? 'var(--status-green)' : 'var(--text-primary)' }}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function BarChartIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0a0f1a' }}>
      <path d="M3 3v18h18M7 16v-5m4 5V8m4 8v-3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function MessagesIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  )
}

function TasksIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  )
}

function EmployeesIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function FilesIcon() {
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

function StaffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}
