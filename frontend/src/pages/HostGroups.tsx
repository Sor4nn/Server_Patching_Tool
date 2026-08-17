import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { HostGroup, InventorySource } from '../types'
import { IconPlus, IconRefresh, IconTrash } from '../components/Icons'
import CreateSourceModal from '../components/CreateSourceModal'

export default function HostGroups() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [sources, setSources] = useState<InventorySource[]>([])
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState<number | null>(null)
  const [showRepoModal, setShowRepoModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)

  const load = async () => {
    try {
      const [g, s] = await Promise.all([api.listGroups(), api.listSources()])
      setGroups(g.groups)
      setSources(s.sources)
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

  const removeSource = async (id: number) => {
    if (!confirm('Delete this repository? Hosts already synced are kept.')) return
    try {
      await api.deleteSource(id)
      setSources(sources.filter((s) => s.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const removeGroup = async (id: number) => {
    if (!confirm('Delete this group? Hosts will be unassigned.')) return
    try {
      await api.deleteGroup(id)
      setGroups(groups.filter((g) => g.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Repositories</h1>
          <p className="page-sub">{sources.length} repositories · {groups.length} host groups</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowRepoModal(true)}>
            <IconPlus size={14} /> New Repository
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* Repositories (AWX-style git sources) */}
      <h3 className="widget-title" style={{ marginTop: 4 }}>Repositories</h3>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Repository</th><th>Branch</th><th>Auth</th><th>Hosts</th><th>Playbooks</th><th>Last Sync</th><th>Status</th>{isAdmin && <th />}</tr>
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
                  <td>{s.template_count ?? 0}</td>
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
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeSource(s.id)} title="Delete">
                        <IconTrash size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="muted">
                    No repositories yet — add your first git repository (AWX-inventory style) and its hosts will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Host Groups */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
        <div>
          <h3 className="widget-title" style={{ margin: 0 }}>Host Groups</h3>
          <p className="page-sub" style={{ margin: 0 }}>Groups grouped from repositories or created manually</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-sm" onClick={() => setShowGroupModal(true)}>
            <IconPlus size={12} /> New Group
          </button>
        )}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Group Name</th><th>Description</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{g.name}</td>
                  <td className="muted">{g.description || '-'}</td>
                  {isAdmin && (
                    <td className="text-right">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeGroup(g.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {groups.length === 0 && <tr><td colSpan={isAdmin ? 3 : 2} className="muted">No groups created yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showRepoModal && <CreateSourceModal onClose={() => setShowRepoModal(false)} onCreated={load} />}
      {showGroupModal && <CreateGroupModal onClose={() => setShowGroupModal(false)} onCreated={load} />}
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
            <label>Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production Webservers" />
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Group notes or region..." />
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