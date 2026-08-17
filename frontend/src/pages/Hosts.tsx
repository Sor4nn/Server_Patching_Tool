import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'
import type { Host, HostGroup } from '../types'
import { IconPlus, IconSearch } from '../components/Icons'

function StateBadge({ state }: { state: string | null }) {
  if (!state) return <span className="badge badge-gray">Unknown</span>
  const tone = state === 'Blocked' ? 'badge-red' : state === 'Completed' ? 'badge-green' : 'badge-blue'
  return <span className={`badge ${tone}`}>{state}</span>
}

export default function Hosts() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [h, g] = await Promise.all([api.listHosts(), api.listGroups()])
      setHosts(h.hosts)
      setGroups(g.groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const filtered = search
    ? hosts.filter((h) => (h.hostname + ' ' + (h.ip_address || '') + ' ' + (h.friendly_name || '')).toLowerCase().includes(search.toLowerCase()))
    : hosts

  const remove = async (id: number) => {
    if (!confirm('Delete this host?')) return
    try {
      await api.deleteHost(id)
      setHosts(hosts.filter((h) => h.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hosts</h1>
          <p className="page-sub">{hosts.length} hosts registered in estate</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> Add Host
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="mb flex flex-between">
        <div className="top-search-bar" style={{ width: 340 }}>
          <IconSearch className="top-search-icon" size={15} />
          <input
            className="top-search-input"
            placeholder="Search hostname or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>IP Address</th>
                <th>OS</th>
                <th>Group</th>
                <th>Latest Patch</th>
                <th>State</th>
                <th>Updated</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link to={`/hosts/${h.id}`} style={{ color: '#60a5fa', fontWeight: 600, textDecoration: 'none' }}>
                      {h.friendly_name || h.hostname}
                    </Link>
                  </td>
                  <td className="mono muted">{h.ip_address || '-'}</td>
                  <td>{[h.os_make, h.os_version].filter(Boolean).join(' ') || '-'}</td>
                  <td>{h.group?.name || '-'}</td>
                  <td className="mono muted">{h.latest_patch || '-'}</td>
                  <td><StateBadge state={h.state} /></td>
                  <td className="muted">{h.updated_at.slice(0, 10)}</td>
                  {isAdmin && (
                    <td className="text-right">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(h.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="muted">No hosts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateHostModal groups={groups} onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function CreateHostModal({ groups, onClose, onCreated }: {
  groups: HostGroup[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({ hostname: '', ip_address: '', os_make: 'Linux', os_version: '', friendly_name: '', group_id: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createHost({ ...form, group_id: form.group_id ? Number(form.group_id) : null })
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
        <h3>Add New Host</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Hostname *</label>
            <input required value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="e.g. srv-prod-01" />
          </div>
          <div className="form-row">
            <label>IP Address</label>
            <input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.50" />
          </div>
          <div className="form-row">
            <label>OS Make</label>
            <input value={form.os_make} onChange={(e) => setForm({ ...form, os_make: e.target.value })} />
          </div>
          <div className="form-row">
            <label>OS Version</label>
            <input value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} placeholder="e.g. Rocky Linux 9.2" />
          </div>
          <div className="form-row">
            <label>Friendly Name</label>
            <input value={form.friendly_name} onChange={(e) => setForm({ ...form, friendly_name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Group</label>
            <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">None</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create Host'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
