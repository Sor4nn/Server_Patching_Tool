import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import type { User } from './types'
import { TopNav } from './components/TopNav'
import {
  IconDashboard,
  IconServer,
  IconRepo,
  IconPackage,
  IconBandage,
  IconShield,
  IconFileText,
  IconDocker,
  IconBot,
  IconSettings,
  IconLink,
  IconChevronDown,
  IconChevronRight,
  IconChevronLeft,
  IconPlus,
  IconPatchMonLogo,
} from './components/Icons'

import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import HostDetail from './pages/HostDetail'
import HostGroups from './pages/HostGroups'
import Integration from './pages/Integration'
import Patching from './pages/Patching'
import Packages from './pages/Packages'
import Policies from './pages/Policies'
import Settings from './pages/Settings'
import Compliance from './pages/Compliance'
import Reporting from './pages/Reporting'
import Docker from './pages/Docker'
import Automation from './pages/Automation'
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
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    operations_patching: true,
    operations_compliance: false,
    operations_reporting: false,
    operations_docker: false,
    system_links: false,
  })

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

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
          <NavLink to="/" end className="nav-item">
            <span className="nav-icon"><IconDashboard size={17} /></span>
            {!collapsed && <span className="nav-label">Dashboard</span>}
          </NavLink>

          {/* ASSETS SECTION */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">Assets</div>}
            
            <NavLink to="/hosts" className="nav-item">
              <span className="nav-icon"><IconServer size={17} /></span>
              {!collapsed && (
                <>
                  <span className="nav-label">Hosts</span>
                  <div className="nav-badges">
                    <span className="nav-badge-pill nav-badge-green">1</span>
                    <span className="nav-badge-pill nav-badge-red">1</span>
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

            <NavLink to="/packages" className="nav-item">
              <span className="nav-icon"><IconPackage size={17} /></span>
              {!collapsed && <span className="nav-label">Packages</span>}
            </NavLink>
          </div>

          {/* OPERATIONS SECTION */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">Operations</div>}

            {/* Patching dropdown */}
            <div className={`nav-item-group ${location.pathname.startsWith('/patching') || location.pathname === '/integration' || location.pathname === '/automation-options' ? 'active' : ''}`}>
              <div
                className="nav-group-header"
                onClick={() => {
                  if (collapsed) {
                    navigate('/patching')
                  } else {
                    toggleGroup('operations_patching')
                  }
                }}
              >
                <div className="flex" style={{ gap: 9 }}>
                  <span className="nav-icon"><IconBandage size={17} /></span>
                  {!collapsed && <span className="nav-label">Patching</span>}
                </div>
                {!collapsed && (
                  <span className="nav-caret">
                    {openGroups.operations_patching ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                  </span>
                )}
              </div>

              {!collapsed && openGroups.operations_patching && (
                <div className="nav-sub">
                  <NavLink to="/patching" end className="nav-subitem">
                    Overview
                  </NavLink>
                  <NavLink to="/integration" className="nav-subitem">
                    Runs & History
                  </NavLink>
                  <NavLink to="/automation-options" className="nav-subitem">
                    Policies
                  </NavLink>
                </div>
              )}
            </div>

            {/* Compliance */}
            <NavLink to="/compliance" className="nav-item">
              <span className="nav-icon"><IconShield size={17} /></span>
              {!collapsed && <span className="nav-label">Compliance</span>}
            </NavLink>

            {/* Reporting */}
            <NavLink to="/reporting" className="nav-item">
              <span className="nav-icon"><IconFileText size={17} /></span>
              {!collapsed && <span className="nav-label">Reporting</span>}
            </NavLink>

            {/* Docker (Beta) */}
            <NavLink to="/docker" className="nav-item">
              <span className="nav-icon"><IconDocker size={17} /></span>
              {!collapsed && (
                <>
                  <span className="nav-label">Docker</span>
                  <span className="nav-badge-pill nav-badge-beta">Beta</span>
                </>
              )}
            </NavLink>
          </div>

          {/* SYSTEM SECTION */}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">System</div>}

            <NavLink to="/automation" className="nav-item">
              <span className="nav-icon"><IconBot size={17} /></span>
              {!collapsed && <span className="nav-label">Automation</span>}
            </NavLink>

            <NavLink to="/settings" className="nav-item">
              <span className="nav-icon"><IconSettings size={17} /></span>
              {!collapsed && <span className="nav-label">Settings</span>}
            </NavLink>

            <div className="nav-item-group">
              <div className="nav-group-header" onClick={() => toggleGroup('system_links')}>
                <div className="flex" style={{ gap: 9 }}>
                  <span className="nav-icon"><IconLink size={17} /></span>
                  {!collapsed && <span className="nav-label">Links</span>}
                </div>
                {!collapsed && (
                  <span className="nav-caret">
                    {openGroups.system_links ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                  </span>
                )}
              </div>
            </div>
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
            <Route path="/patching" element={<Patching />} />
            <Route path="/integration" element={<Integration />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/automation-options" element={<Policies />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/docker" element={<Docker />} />
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
