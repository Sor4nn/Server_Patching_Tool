import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'
import type { Host, HostGroup } from '../types'

export default function HostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [host, setHost] = useState<Host | null>(null)
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({ friendly_name: '', os_version: '', group_id: '', remarks: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getHost(Number(id)).then((res) => {
      setHost(res.host)
      setForm({
        friendly_name: res.host.friendly_name || '',
        os_version: res.host.os_version || '',
        group_id: res.host.group_id?.toString() || '',
        remarks: res.host.remarks || '',
      })
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
    api.listGroups().then((res) => setGroups(res.groups)).catch(() => {})
  }, [id])

  const save = async () => {
    if (!host) return
    setSaved(false)
    try {
      const res = await api.updateHost(host.id, {
        friendly_name: form.friendly_name || null,
        os_version: form.os_version || null,
        group_id: form.group_id ? Number(form.group_id) : null,
        remarks: form.remarks || null,
      })
      setHost(res.host)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const remove = async () => {
    if (!host) return
    if (!confirm(`Delete host ${host.hostname}?`)) return
    try {
      await api.deleteHost(host.id)
      navigate('/hosts')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (error && !host) return <div className="login-error">{error}</div>
  if (!host) return <div className="boot-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-sm mb" onClick={() => navigate('/hosts')}>← Back to Hosts</button>
          <h1 className="page-title">{host.friendly_name || host.hostname}</h1>
          <p className="page-sub mono">{host.hostname} · {host.ip_address || 'no IP'}</p>
        </div>
        {isAdmin && <button className="btn btn-danger" onClick={remove}>Delete Host</button>}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Details</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><th>Hostname</th><td className="mono">{host.hostname}</td></tr>
                <tr><th>IP Address</th><td className="mono">{host.ip_address || '-'}</td></tr>
                <tr><th>OS Make</th><td>{host.os_make || '-'}</td></tr>
                <tr><th>OS Version</th><td>{host.os_version || '-'}</td></tr>
                <tr><th>Latest Patch</th><td className="mono">{host.latest_patch || '-'}</td></tr>
                <tr><th>Uptime</th><td>{host.uptime || '-'}</td></tr>
                <tr><th>State</th><td>{host.state || 'Unknown'}</td></tr>
                <tr><th>Action</th><td>{host.action || '-'}</td></tr>
                <tr><th>Group</th><td>{host.group?.name || '-'}</td></tr>
                <tr><th>Remarks</th><td>{host.remarks || '-'}</td></tr>
                <tr><th>Created</th><td className="muted">{host.created_at.slice(0, 19).replace('T', ' ')}</td></tr>
                <tr><th>Updated</th><td className="muted">{host.updated_at.slice(0, 19).replace('T', ' ')}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {isAdmin && (
          <div className="card">
            <h2 className="card-title">Edit</h2>
            <div className="form-row">
              <label>Friendly Name</label>
              <input value={form.friendly_name} onChange={(e) => setForm({ ...form, friendly_name: e.target.value })} />
            </div>
            <div className="form-row">
              <label>OS Version</label>
              <input value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Group</label>
              <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                <option value="">None</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Remarks</label>
              <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <div className="flex flex-between">
              <button className="btn btn-primary" onClick={save}>Save Changes</button>
              {saved && <span className="badge badge-green">Saved ✓</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
