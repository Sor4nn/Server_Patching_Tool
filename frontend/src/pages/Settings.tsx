import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { HostGroup, User } from '../types'
import {
  IconUser,
  IconUsers,
  IconServer,
  IconDiscord,
  IconShield,
  IconRepo,
  IconRefresh,
  IconLink,
  IconTerminal,
  IconGlobe,
  IconEdit,
  IconTrash,
  IconPlus,
} from '../components/Icons'

type SettingsTab =
  | 'users'
  | 'roles'
  | 'profile'
  | 'discord'
  | 'oidc'
  | 'host_groups'
  | 'agent_updates'
  | 'agent_version'
  | 'api_integrations'
  | 'ai_terminal'
  | 'server_url'
  | 'environment'
  | 'branding'
  | 'server_version'
  | 'metrics'

export default function Settings() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [activeTab, setActiveTab] = useState<SettingsTab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [error, setError] = useState('')
  const [selfRegistration, setSelfRegistration] = useState(false)

  const load = async () => {
    try {
      const [u, g] = await Promise.all([api.listUsers().catch(() => ({ success: false, users: [] })), api.listGroups().catch(() => ({ success: false, groups: [] }))])
      setUsers(u.users || [])
      setGroups(g.groups || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const toggleAdmin = async (u: User) => {
    try {
      await api.updateUser(u.id, { is_admin: u.is_admin === 1 ? 0 : 1 })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const deleteUser = async (u: User) => {
    if (!confirm(`Delete user ${u.username}?`)) return
    try {
      await api.deleteUser(u.id)
      setUsers(users.filter((x) => x.id !== u.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Configure users, integrations, agents, and server preferences</p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="settings-shell">
        {/* Left Sub-nav panel */}
        <div className="settings-nav-panel">
          <div className="settings-nav-section-title">User Management</div>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <IconUsers size={15} /> Users
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <IconShield size={15} /> Roles
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <IconUser size={15} /> My Profile
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'discord' ? 'active' : ''}`}
            onClick={() => setActiveTab('discord')}
          >
            <IconDiscord size={15} /> Discord Auth
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'oidc' ? 'active' : ''}`}
            onClick={() => setActiveTab('oidc')}
          >
            <IconShield size={15} /> OIDC / SSO
          </button>

          <div className="settings-nav-section-title" style={{ marginTop: 14 }}>Hosts Management</div>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'host_groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('host_groups')}
          >
            <IconRepo size={15} /> Host Groups
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'agent_updates' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent_updates')}
          >
            <IconRefresh size={15} /> Agent Updates
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'agent_version' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent_version')}
          >
            <IconServer size={15} /> Agent Version
          </button>

          <div className="settings-nav-section-title" style={{ marginTop: 14 }}>Integrations</div>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'api_integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('api_integrations')}
          >
            <IconLink size={15} /> API Integrations
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'ai_terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai_terminal')}
          >
            <IconTerminal size={15} /> AI Terminal
          </button>

          <div className="settings-nav-section-title" style={{ marginTop: 14 }}>Server</div>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'server_url' ? 'active' : ''}`}
            onClick={() => setActiveTab('server_url')}
          >
            <IconGlobe size={15} /> Server URL
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'environment' ? 'active' : ''}`}
            onClick={() => setActiveTab('environment')}
          >
            <IconServer size={15} /> Environment
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'branding' ? 'active' : ''}`}
            onClick={() => setActiveTab('branding')}
          >
            <IconEdit size={15} /> Branding
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'server_version' ? 'active' : ''}`}
            onClick={() => setActiveTab('server_version')}
          >
            <IconRefresh size={15} /> Server Version
          </button>
          <button
            type="button"
            className={`settings-nav-link ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <IconUsers size={15} /> Metrics
          </button>
        </div>

        {/* Right Content Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* TAB: USERS */}
          {activeTab === 'users' && (
            <>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="flex flex-between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div className="flex" style={{ gap: 16 }}>
                    <span className="flex" style={{ color: '#60a5fa', fontWeight: 600, gap: 6 }}>
                      <IconUsers size={16} /> Users
                    </span>
                    <span className="flex muted" style={{ cursor: 'pointer', gap: 6 }} onClick={() => setActiveTab('roles')}>
                      <IconShield size={16} /> Roles
                    </span>
                  </div>
                  {isAdmin && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreateUser(true)}>
                      <IconPlus size={13} /> Add User
                    </button>
                  )}
                </div>

                <div className="table-wrap">
                  <table style={{ margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#0a0f1c' }}>
                        <th>USER</th>
                        <th>EMAIL</th>
                        <th>ROLE</th>
                        <th>STATUS</th>
                        <th>CREATED</th>
                        <th>LAST LOGIN</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const isSuperAdmin = u.is_admin === 1 && u.username === 'sor4n'
                        return (
                          <tr key={u.id}>
                            <td>
                              <span className="flex" style={{ gap: 8 }}>
                                <span className="user-avatar-circle">{u.username[0].toUpperCase()}</span>
                                <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{u.username}</span>
                                {u.username === user?.username && <span className="badge badge-gray" style={{ fontSize: 9.5 }}>You</span>}
                              </span>
                            </td>
                            <td className="muted flex" style={{ gap: 5 }}>
                              <span style={{ fontSize: 11 }}>✉</span> {u.email || '—'}
                            </td>
                            <td>
                              {isSuperAdmin ? (
                                <span className="badge badge-amber" style={{ fontSize: 10.5 }}>Super Admin</span>
                              ) : u.is_admin === 1 ? (
                                <span className="badge badge-blue" style={{ fontSize: 10.5 }}>Admin</span>
                              ) : (
                                <span className="badge badge-gray" style={{ fontSize: 10.5 }}>Viewer</span>
                              )}
                            </td>
                            <td>
                              <span className="flex" style={{ color: '#4ade80', fontSize: 11.5, gap: 4 }}>
                                ✓ Active
                              </span>
                            </td>
                            <td className="muted">{u.created_at ? u.created_at.slice(0, 10) : '—'}</td>
                            <td className="muted">{u.last_login ? u.last_login.slice(0, 10) : '—'}</td>
                            <td>
                              <div className="flex" style={{ gap: 6 }}>
                                <button type="button" className="btn btn-ghost btn-sm" title="Edit Role" onClick={() => toggleAdmin(u)}>
                                  <IconEdit size={13} />
                                </button>
                                {isAdmin && u.username !== user?.username && (
                                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} title="Delete" onClick={() => deleteUser(u)}>
                                    <IconTrash size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Registration Settings */}
              <div className="card">
                <h3 className="card-title">User Registration Settings</h3>
                <label className="flex" style={{ cursor: 'pointer', marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selfRegistration}
                    onChange={(e) => setSelfRegistration(e.target.checked)}
                  />
                  <span style={{ fontWeight: 600 }}>Enable User Self-Registration</span>
                </label>
                <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  When enabled, users can create their own accounts through the signup page. When disabled, only administrators can create user accounts.
                </p>

                <div style={{ background: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.3)', borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <IconShield size={18} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 12, color: '#93c5fd' }}>
                    <strong>Security Notice</strong>
                    <div style={{ marginTop: 2 }}>
                      When enabling user self-registration, exercise caution on internal networks. Consider restricting access to trusted networks only and ensure proper role assignments to prevent unauthorized access to sensitive systems.
                    </div>
                  </div>
                </div>

                <div className="flex" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
                  <span className="muted" style={{ fontSize: 12 }}>This toggle is not persisted to the server yet.</span>
                </div>
              </div>
            </>
          )}

          {/* TAB: HOST GROUPS */}
          {activeTab === 'host_groups' && (
            <div className="card">
              <div className="flex flex-between mb">
                <h3 className="card-title" style={{ margin: 0 }}>Host Groups</h3>
                {isAdmin && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreateGroup(true)}>
                    <IconPlus size={13} /> Add Group
                  </button>
                )}
              </div>
              <table style={{ margin: 0 }}>
                <thead>
                  <tr><th>Group Name</th><th>Description</th>{isAdmin && <th />}</tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.name}</td>
                      <td className="muted">{g.description || '—'}</td>
                      {isAdmin && (
                        <td className="text-right">
                          <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
                            if (!confirm('Delete group?')) return
                            await api.deleteGroup(g.id)
                            load()
                          }}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups.length === 0 && (
                    <tr><td colSpan={3} className="muted">No host groups configured yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: SERVER VERSION */}
          {activeTab === 'server_version' && (
            <div className="card">
              <h3 className="card-title">Server Version Information</h3>
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr><th>Server Release</th><td className="mono" style={{ color: '#4ade80' }}>v2.1.3</td></tr>
                    <tr><th>API Backend</th><td className="mono">Python FastAPI / SQLite</td></tr>
                    <tr><th>Frontend UI</th><td className="mono">React 18 / TypeScript / Vite</td></tr>
                    <tr><th>Agent Support</th><td className="mono">Ansible AWX / Custom Agents</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* OTHER TABS FALLBACK */}
          {!['users', 'host_groups', 'server_version'].includes(activeTab) && (
            <div className="card">
              <h3 className="card-title" style={{ textTransform: 'capitalize' }}>{activeTab === 'oidc' ? 'OIDC / SSO' : activeTab.replace('_', ' ')}</h3>
              <p className="muted">Not implemented yet — this section is not available in this version.</p>
            </div>
          )}
        </div>
      </div>

      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={load} />}
      {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} onCreated={load} />}
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', is_admin: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createUser({ ...form, email: form.email || null, is_admin: form.is_admin })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create New User</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Username *</label>
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
          </div>
          <div className="form-row">
            <label>Password *</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-row">
            <label className="flex" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
              Administrator
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createGroup({ name, description: description || null })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create Host Group</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Group Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create Group'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
