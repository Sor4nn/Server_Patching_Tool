import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { HostGroup } from '../types'
import { IconPlus } from '../components/Icons'

export default function HostGroups() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await api.listGroups()
      setGroups(res.groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const remove = async (id: number) => {
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
          <h1 className="page-title">Host Groups & Repos</h1>
          <p className="page-sub">{groups.length} organized groups in estate</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Group
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

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
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(g.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {groups.length === 0 && <tr><td colSpan={isAdmin ? 3 : 2} className="muted">No groups created yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={load} />}
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
