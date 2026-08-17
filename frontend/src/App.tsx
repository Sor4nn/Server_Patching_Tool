import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import type { User } from './types'
import Dashboard from './pages/Dashboard'
import Hosts from './pages/Hosts'
import HostDetail from './pages/HostDetail'
import HostGroups from './pages/HostGroups'
import Integration from './pages/Integration'
import Patching from './pages/Patching'
import Packages from './pages/Packages'
import Policies from './pages/Policies'
import Users from './pages/Users'
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

interface NavChild {
  to: string
  label: string
  end?: boolean
}

interface NavItem {
  to: string
  label: string
  children?: NavChild[]
  adminOnly?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    title: 'Assets',
    items: [
      { to: '/hosts', label: 'Hosts' },
      { to: '/host-groups', label: 'Host Groups' },
      { to: '/packages', label: 'Packages' },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        to: '/patching',
        label: 'Patching',
        children: [
          { to: '/patching', label: 'Patch Tree', end: true },
          { to: '/integration', label: 'Integration' },
          { to: '/automation-options', label: 'Automation Options' },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/users', label: 'Users', adminOnly: true },
    ],
  },
]

function GroupNav({ section }: { section: NavSection }) {
  const { user } = useAuth()
  const location = useLocation()
  const items = section.items.filter((i) => !i.adminOnly || user?.is_admin === 1)

  return (
    <div className="nav-group">
      <div className="nav-group-title">{section.title}</div>
      {items.map((item) => {
        const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
        const childActive = item.children?.some((c) =>
          c.end ? location.pathname === c.to : location.pathname.startsWith(c.to)) || active

        if (!item.children) {
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
              {item.label}
            </NavLink>
          )
        }
        return (
          <div key={item.to} className={`nav-item nav-item-group ${childActive ? 'active' : ''}`}>
            <div className="nav-item-label">
              {item.label}
              <span className="nav-caret">{childActive ? '▾' : '▸'}</span>
            </div>
            <div className="nav-sub">
              {item.children.map((c) => (
                <NavLink key={c.to} to={c.to} end={c.end} className="nav-subitem">
                  {c.label}
                </NavLink>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Layout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()

  const logout = async () => {
    await api.logout()
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🛠️</span>
          <div>
            <div className="brand-name">GPTA</div>
            <div className="brand-sub">Gotta Patchem Them All</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-item">Dashboard</NavLink>
          {NAV.map((section) => <GroupNav key={section.title} section={section} />)}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-avatar">{(user?.username || '?')[0].toUpperCase()}</span>
            <div>
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{user?.is_admin === 1 ? 'Administrator' : 'Viewer'}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={logout}>Sign out</button>
        </div>
      </aside>
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
          {user?.is_admin === 1 && <Route path="/users" element={<Users />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
