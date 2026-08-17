import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'
import type { Host, HostGroup } from '../types'
import {
  IconServer,
  IconClock,
  IconRestart,
  IconWifi,
  IconSearch,
  IconFilter,
  IconColumns,
  IconAlertTriangle,
  IconPlus,
  IconRefresh,
  IconRedHat,
  IconExternalLink,
} from '../components/Icons'

export default function Hosts() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])

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
    ? hosts.filter((h) => (h.hostname + ' ' + (h.ip_address || '') + ' ' + (h.friendly_name || '') + ' ' + (h.os_make || '')).toLowerCase().includes(search.toLowerCase()))
    : hosts

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([])
    else setSelectedIds(filtered.map((h) => h.id))
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this host?')) return
    try {
      await api.deleteHost(id)
      setHosts(hosts.filter((h) => h.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  // Host metrics
  const totalCount = hosts.length
  const connectedCount = hosts.filter((h) => h.state !== 'Blocked').length
  const offlineCount = totalCount - connectedCount

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Hosts</h1>
          <p className="page-sub">Manage and monitor your connected hosts</p>
        </div>
        <div className="flex">
          <button type="button" className="btn btn-sm" onClick={load} title="Refresh hosts">
            <IconRefresh size={14} />
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <IconPlus size={14} /> Add Host
            </button>
          )}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* Top 4 Stat Cards */}
      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconServer size={16} /></span>
            <span>Total Hosts</span>
          </div>
          <div className="top-stat-value">{totalCount}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconClock size={16} /></span>
            <span>Needs Updates</span>
          </div>
          <div className="top-stat-value">0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconRestart size={16} /></span>
            <span>Needs Reboots</span>
          </div>
          <div className="top-stat-value">0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconWifi size={16} /></span>
            <span>Connection Status</span>
          </div>
          <div className="flex" style={{ gap: 14, marginTop: 4 }}>
            <span className="flex" style={{ gap: 5, color: '#4ade80', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
              {connectedCount} Connected
            </span>
            <span className="flex" style={{ gap: 5, color: '#f87171', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} />
              {offlineCount} Offline
            </span>
          </div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-between mb" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="top-search-bar" style={{ width: 380 }}>
          <IconSearch className="top-search-icon" size={15} />
          <input
            className="top-search-input"
            placeholder="Search hosts, IP addresses, or OS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm">
            <IconFilter size={14} /> Filters
          </button>
          <button type="button" className="btn btn-sm">
            <IconColumns size={14} /> Columns
          </button>
          <select style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}>
            <option>No Grouping</option>
            <option>By Group</option>
            <option>By OS</option>
          </select>
          <button type="button" className="btn btn-sm">
            <IconAlertTriangle size={14} /> Hide Stale
          </button>
        </div>
      </div>

      {/* Hosts Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: '#0a0f1c' }}>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', cursor: 'pointer' }}
                    checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Friendly Name ⇅</th>
                <th>System Hostname ⇅</th>
                <th>Group ⇅</th>
                <th>OS ⇅</th>
                <th>Agent Version ⇅</th>
                <th>Agent Auto-Update</th>
                <th>Connection</th>
                <th>Integrations ⇅</th>
                <th>Reporting ⇅</th>
                <th>Reboot ⇅</th>
                <th>Uptime ⇅</th>
                <th>Updates ⇅</th>
                <th>Security Updates ⇅</th>
                <th>Last Update ⇅</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => {
                const reported = !!h.last_seen
                return (
                  <tr key={h.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto', cursor: 'pointer' }}
                        checked={selectedIds.includes(h.id)}
                        onChange={() => toggleSelect(h.id)}
                      />
                    </td>
                    <td>
                      <Link to={`/hosts/${h.id}`} style={{ color: '#ffffff', fontWeight: 600, textDecoration: 'none' }}>
                        {h.friendly_name || h.ip_address || h.hostname}
                      </Link>
                    </td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{h.hostname || 'localhost.localdomain'}</td>
                    <td>
                      <span className="badge badge-gray">{h.group?.name || 'Ungrouped'}</span>
                    </td>
                    <td>
                      <span className="flex" style={{ gap: 6 }}>
                        <IconRedHat size={14} />
                        <span>{h.os_make || 'Red Hat Enterprise Linux'}</span>
                      </span>
                    </td>
                    <td className="mono muted">-</td>
                    <td>
                      <span className="flex muted" style={{ fontSize: 11 }}>
                        No <span style={{ width: 14, height: 8, background: '#334155', borderRadius: 4, display: 'inline-block', marginLeft: 4 }} />
                      </span>
                    </td>
                    <td>
                      {reported ? (
                        <span className="badge badge-green flex" style={{ gap: 4 }}>
                          <IconWifi size={11} /> WS
                        </span>
                      ) : (
                        <span className="badge badge-gray flex" style={{ gap: 4 }}>
                          <IconWifi size={11} /> Unknown
                        </span>
                      )}
                    </td>
                    <td className="mono muted">-</td>
                    <td>
                      {reported ? (
                        <span className="badge badge-green">Reporting</span>
                      ) : (
                        <span className="badge badge-gray">Awaiting report</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-green">✓ No</span>
                    </td>
                    <td className="mono muted">{h.uptime || '-'}</td>
                    <td style={{ color: '#f59e0b', fontWeight: 600 }}>{h.outdated_count ?? 0}</td>
                    <td style={{ color: '#f87171', fontWeight: 600 }}>{h.security_count ?? 0}</td>
                    <td className="muted">{h.last_seen ? new Date(h.last_seen).toLocaleString() : '-'}</td>
                    <td>
                      <div className="flex" style={{ gap: 8 }}>
                        <Link to={`/hosts/${h.id}`} style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          View <IconExternalLink size={12} />
                        </Link>
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 4px', color: 'var(--red)' }}
                            title="Delete Host"
                            onClick={() => remove(h.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={16} className="muted" style={{ textAlign: 'center', padding: 24 }}>No hosts found matching filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table pagination footer */}
        <div className="flex flex-between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: '#0a0f1c', fontSize: 12, color: 'var(--text-dim)' }}>
          <div className="flex" style={{ gap: 8 }}>
            <span>Rows per page:</span>
            <select style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }}>
              <option>50</option>
              <option>25</option>
              <option>100</option>
            </select>
            <span>1-{filtered.length} of {filtered.length}</span>
          </div>

          <div className="flex" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm" disabled style={{ padding: '3px 8px' }}>‹</button>
            <span>Page 1 of 1</span>
            <button type="button" className="btn btn-sm" disabled style={{ padding: '3px 8px' }}>›</button>
          </div>
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
  const [form, setForm] = useState({ hostname: '', ip_address: '', os_make: 'Red Hat Enterprise Linux', os_version: '9.8', friendly_name: '', group_id: '' })
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
            <input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.214" />
          </div>
          <div className="form-row">
            <label>OS Make</label>
            <input value={form.os_make} onChange={(e) => setForm({ ...form, os_make: e.target.value })} />
          </div>
          <div className="form-row">
            <label>OS Version</label>
            <input value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} placeholder="9.8" />
          </div>
          <div className="form-row">
            <label>Friendly Name</label>
            <input value={form.friendly_name} onChange={(e) => setForm({ ...form, friendly_name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Group</label>
            <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Ungrouped</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Add Host'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
