import { useEffect, useState } from 'react'
import { api } from '../api'
import type { User } from '../types'

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await api.listUsers()
      setUsers(res.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (u: User) => {
    try {
      await api.updateUser(u.id, { is_active: u.is_active === 1 ? 0 : 1 })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const toggleAdmin = async (u: User) => {
    try {
      await api.updateUser(u.id, { is_admin: u.is_admin === 1 ? 0 : 1 })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const remove = async (u: User) => {
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
          <h1 className="page-title">Users</h1>
          <p className="page-sub">{users.length} users</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td className="muted">{u.email || '-'}</td>
                  <td>
                    <span className={`badge ${u.is_admin === 1 ? 'badge-blue' : 'badge-gray'}`}>
                      {u.is_admin === 1 ? 'Admin' : 'Viewer'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active === 1 ? 'badge-green' : 'badge-red'}`}>
                      {u.is_active === 1 ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="muted">{u.last_login ? u.last_login.slice(0, 16).replace('T', ' ') : 'Never'}</td>
                  <td className="flex">
                    <button className="btn btn-sm" onClick={() => toggleAdmin(u)}>
                      {u.is_admin === 1 ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                    <button className="btn btn-sm" onClick={() => toggleActive(u)}>
                      {u.is_active === 1 ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={load} />}
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
        <h3>New User</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Username *</label>
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
