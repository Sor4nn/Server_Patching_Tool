import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { InventorySource } from '../types'
import { IconPlus, IconRefresh, IconTrash } from '../components/Icons'

export default function InventorySources() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [sources, setSources] = useState<InventorySource[]>([])
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await api.listSources()
      setSources(res.sources)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const sync = async (id: number) => {
    setSyncing(id)
    setError('')
    try {
      const res = await api.syncSource(id)
      if (!res.success) throw new Error(res.error || 'Sync failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this inventory source? Hosts already synced are kept.')) return
    try {
      await api.deleteSource(id)
      setSources(sources.filter((s) => s.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Sources</h1>
          <p className="page-sub">Sync hosts and groups from git repositories (AWX-style)</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Source
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Repository</th><th>Branch</th><th>Auth</th><th>Hosts</th><th>Last Sync</th><th>Status</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>
                    {s.name}
                    {!s.enabled && <span className="badge badge-gray" style={{ marginLeft: 6 }}>disabled</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{s.repo_url}</td>
                  <td className="mono">{s.branch}</td>
                  <td>{s.auth_type}</td>
                  <td>{s.host_count ?? 0}</td>
                  <td className="muted">{s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : '-'}</td>
                  <td>
                    {s.last_sync_status === 'success' && <span className="badge badge-green">success</span>}
                    {s.last_sync_status === 'failed' && <span className="badge badge-red" title={s.last_error || ''}>failed</span>}
                    {!s.last_sync_status && <span className="muted">never</span>}
                  </td>
                  {isAdmin && (
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => sync(s.id)}
                        disabled={syncing === s.id}
                        title="Sync now"
                      >
                        <IconRefresh size={13} /> {syncing === s.id ? 'Syncing…' : 'Sync'}
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s.id)} title="Delete">
                        <IconTrash size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {sources.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="muted">No inventory sources configured yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateSourceModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function CreateSourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    repo_url: '',
    branch: 'main',
    auth_type: 'none',
    username: '',
    password: '',
    token: '',
    file_pattern: '**/*',
    prune_missing: false,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await api.createSource(form)
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ marginBottom: 12 }}>New Inventory Source</h3>
        {error && <div className="login-error">{error}</div>}
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My inventory repo" />
        <label className="form-label">Repository URL</label>
        <input className="form-input" value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="https://git.example.com/org/inventory.git" />
        <label className="form-label">Branch</label>
        <input className="form-input" value={form.branch} onChange={(e) => set('branch', e.target.value)} />
        <label className="form-label">Auth</label>
        <select className="form-input" value={form.auth_type} onChange={(e) => set('auth_type', e.target.value)}>
          <option value="none">None (public)</option>
          <option value="token">Personal access token</option>
          <option value="userpass">Username / password</option>
          <option value="ssh">SSH key (agent)</option>
        </select>
        {form.auth_type === 'token' && (
          <>
            <label className="form-label">Token</label>
            <input className="form-input" type="password" value={form.token} onChange={(e) => set('token', e.target.value)} />
          </>
        )}
        {form.auth_type === 'userpass' && (
          <>
            <label className="form-label">Username</label>
            <input className="form-input" value={form.username} onChange={(e) => set('username', e.target.value)} />
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </>
        )}
        <label className="form-label">File pattern (e.g. **/*, inventories/*)</label>
        <input className="form-input" value={form.file_pattern} onChange={(e) => set('file_pattern', e.target.value)} />
        <label className="checkbox-row">
          <input type="checkbox" checked={form.prune_missing} onChange={(e) => set('prune_missing', e.target.checked)} />
          Prune hosts no longer present in the repository
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}