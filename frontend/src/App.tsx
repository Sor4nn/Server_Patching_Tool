import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api'
import type { User } from './types'
import { TopNav } from './components/TopNav'
import {
  IconServer,
  IconRepo,
  IconPackage,
  IconShield,
  IconDocker,
  IconPlay,
  IconFileText,
  IconClock,
  IconList,
  IconSettings,
  IconChevronRight,
  IconChevronLeft,
  IconPlus,
  IconPatchMonLogo,
} from './components/Icons'

import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import HostDetail from './pages/HostDetail'
import HostGroups from './pages/HostGroups'
import RepoForm from './pages/RepoForm'
import ExecutionEnvironments from './pages/ExecutionEnvironments'
import Integration from './pages/Integration'
import Patching from './pages/Patching'
import PatchingRun from './pages/PatchingRun'
import Packages from './pages/Packages'
import Policies from './pages/Policies'
import Settings from './pages/Settings'
import Compliance from './pages/Compliance'
import Reporting from './pages/Reporting'
import Services from './pages/Services'
import Automation from './pages/Automation'
import Credentials from './pages/Credentials'
import Templates from './pages/Templates'
import Schedules from './pages/Schedules'
import PackageHistory from './pages/PackageHistory'
import SecurityReporting from './pages/SecurityReporting'
import Login from './pages/Login'

interface AuthCtx {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, setUser: () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

function Layout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const logout = async () => {
    await api.logout()
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!collapsed ? (
            <NavLink to="/" className="brand-wrapper">
              <IconPatchMonLogo size={26} />
              <span className="brand-name">PatchMon</span>
            </NavLink>
          ) : (
            <NavLink to="/" className="brand-wrapper" title="PatchMon">
              <IconPatchMonLogo size={26} />
            </NavLink>
          )}
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronRight size={13} /> : <IconChevronLeft size={13} />}
          </button>
        </div>

        <nav className="nav">
          <NavLink to="/security-reporting" className="nav-item">
            <span className="nav-icon"><IconShield size={17} /></span>
            {!collapsed && <span className="nav-label">Security Reporting</span>}
          </NavLink>

          {/* ASSETS */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">Assets</div>}

            <NavLink to="/hosts" className="nav-item">
              <span className="nav-icon"><IconServer size={17} /></span>
              {!collapsed && (
                <>
                  <span className="nav-label">Hosts</span>
                  <div className="nav-badges">
                    <button
                      type="button"
                      className="nav-quick-add"
                      title="Add Host"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        navigate('/hosts')
                      }}
                    >
                      <IconPlus size={10} />
                    </button>
                  </div>
                </>
              )}
            </NavLink>

            <NavLink to="/host-groups" className="nav-item">
              <span className="nav-icon"><IconRepo size={17} /></span>
              {!collapsed && <span className="nav-label">Repos</span>}
            </NavLink>

            <NavLink to="/execution-environments" className="nav-item">
              <span className="nav-icon"><IconDocker size={17} /></span>
              {!collapsed && <span className="nav-label">Exec Environments</span>}
            </NavLink>

            <NavLink to="/packages" className="nav-item">
              <span className="nav-icon"><IconPackage size={17} /></span>
              {!collapsed && <span className="nav-label">Packages</span>}
            </NavLink>

            <NavLink to="/history" className="nav-item">
              <span className="nav-icon"><IconList size={17} /></span>
              {!collapsed && <span className="nav-label">Package History</span>}
            </NavLink>
          </div>

          {/* RUN TEMPLATES */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">Run</div>}

            <NavLink to="/templates" className="nav-item">
              <span className="nav-icon"><IconPlay size={17} /></span>
              {!collapsed && <span className="nav-label">Run Templates</span>}
            </NavLink>

            <NavLink to="/schedule" className="nav-item">
              <span className="nav-icon"><IconClock size={17} /></span>
              {!collapsed && <span className="nav-label">Schedule</span>}
            </NavLink>

            <NavLink to="/credentials" className="nav-item">
              <span className="nav-icon"><IconFileText size={17} /></span>
              {!collapsed && <span className="nav-label">Credentials</span>}
            </NavLink>
          </div>

          {/* SYSTEM */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">System</div>}

            <NavLink to="/settings" className="nav-item">
              <span className="nav-icon"><IconSettings size={17} /></span>
              {!collapsed && <span className="nav-label">Settings</span>}
            </NavLink>
          </div>
        </nav>

        {!collapsed && (
          <div className="sidebar-footer">
            <NavLink to="/settings" className="user-chip-wrapper">
              <span className="user-avatar-circle">
                {(user?.username || '?')[0].toUpperCase()}
              </span>
              <div className="user-details">
                <span className="user-name-text">{user?.username || 'test'}</span>
                <span className="user-admin-badge">Admin</span>
              </div>
            </NavLink>
            <button
              type="button"
              className="logout-icon-btn"
              onClick={logout}
              title="Sign out"
            >
              ⎋
            </button>
          </div>
        )}
      </aside>

      <div className="main-wrapper">
        <TopNav />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hosts" element={<Hosts />} />
            <Route path="/hosts/:id" element={<HostDetail />} />
            <Route path="/host-groups" element={<HostGroups />} />
            <Route path="/repositories/new" element={<RepoForm />} />
            <Route path="/repositories/:id/edit" element={<RepoForm />} />
            <Route path="/inventory-sources" element={<Navigate to="/host-groups" replace />} />
            <Route path="/execution-environments" element={<ExecutionEnvironments />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/schedule" element={<Schedules />} />
            <Route path="/credentials" element={<Credentials />} />
            <Route path="/patching" element={<Patching />} />
            <Route path="/patching/run" element={<PatchingRun />} />
            <Route path="/integration" element={<Integration />} />
            <Route path="/security-reporting" element={<SecurityReporting />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/history" element={<PackageHistory />} />
            <Route path="/automation-options" element={<Policies />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/docker" element={<Navigate to="/services" replace />} />
            <Route path="/services" element={<Services />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.profile()
      setUser(res.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshProfile()
  }, [refreshProfile])

  if (loading) {
    return <div className="boot-screen"><div className="spinner" /></div>
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*" element={user ? <Layout /> : <Navigate to="/login" replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}
