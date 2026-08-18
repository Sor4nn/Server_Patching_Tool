import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Host, UniquePackagesReport } from '../types'
import { IconChevronLeft, IconPackage, IconRefresh } from '../components/Icons'

export default function PackagesReport() {
  const navigate = useNavigate()
  const [hosts, setHosts] = useState<Host[]>([])
  const [scope, setScope] = useState<'server' | 'all'>('server')
  const [hostId, setHostId] = useState<number | null>(null)
  const [report, setReport] = useState<UniquePackagesReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.listHosts()
      .then((r) => {
        const eligible = (r.hosts || []).filter((h) => h.os_make && h.os_version)
        setHosts(eligible)
        if (eligible.length > 0) setHostId(eligible[0].id)
      })
      .catch(() => {})
  }, [])

  const load = useCallback((id: number | null) => {
    setLoading(true)
    setReport(null)
    api.uniquePackagesReport(id ?? undefined)
      .then(setReport)
      .catch(() => setReport({ success: false, generated_at: '', groups: [], total: 0 }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (scope === 'server') {
      if (hostId !== null) load(hostId)
    } else {
      load(null)
    }
  }, [scope, hostId, load])

  const selectedHost = hosts.find((h) => h.id === hostId) || null
  const rows = report ? report.groups.flatMap((g) => g.packages) : []
  const fleetHosts = selectedHost
    ? report?.groups.reduce((acc, g) => acc + g.hosts, 0) ?? 0
    : 0

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
            <Link to="/packages" className="btn btn-sm" title="Back to Packages">
              <IconChevronLeft size={14} /> Packages
            </Link>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>Dedicated Report — Unique Packages</h1>
              <p className="page-sub">
                Packages installed on exactly one host of an OS fleet; re-occuring packages are excluded.
              </p>
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => (scope === 'server' ? load(hostId) : load(null))} title="Refresh">
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {/* Report form */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="flex flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="flex" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="flex" style={{ gap: 6 }}>
              <button
                type="button"
                className={`sub-tab-btn ${scope === 'server' ? 'active' : ''}`}
                onClick={() => setScope('server')}
              >
                Per Server
              </button>
              <button
                type="button"
                className={`sub-tab-btn ${scope === 'all' ? 'active' : ''}`}
                onClick={() => setScope('all')}
              >
                All Servers
              </button>
            </div>

            {scope === 'server' && (
              <select
                value={hostId ?? ''}
                onChange={(e) => setHostId(e.target.value ? Number(e.target.value) : null)}
                style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
              >
                {hosts.length === 0 && <option value="">No servers with OS info</option>}
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.friendly_name || h.hostname} ({h.os_make} {h.os_version})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedHost && scope === 'server' && (
            <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
              <span className="badge badge-blue">Server: {selectedHost.friendly_name || selectedHost.hostname}</span>
              <span className="badge badge-blue">{selectedHost.os_make} {selectedHost.os_version}</span>
              <span className="badge badge-blue">{fleetHosts} hosts in fleet</span>
            </div>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: '#0a0f1c' }}>
                <th>Package</th>
                <th>Version</th>
                <th>Server</th>
                <th>OS Fleet</th>
                <th>Status</th>
                <th>CVE</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">
                    Loading report…
                  </td>
                </tr>
              ) : !report || report.total === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">
                    No unique packages found. Every package re-occurs across the hosts of its OS fleet.
                  </td>
                </tr>
              ) : report.groups.map((g) => (
                g.packages.map((p) => {
                  const cves = p.cves ? p.cves.split(',').map((c) => c.trim()).filter(Boolean) : []
                  return (
                    <tr key={`${g.os_make}-${g.os_version}-${p.name}`}>
                      <td>
                        <span className="flex" style={{ gap: 7 }}>
                          <IconPackage size={15} className="muted" />
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name}</span>
                        </span>
                      </td>
                      <td className="mono muted">{p.version}</td>
                      <td>
                        <Link to={`/hosts/${p.host.id}`} style={{ color: '#60a5fa' }}>
                          {p.host.friendly_name || p.host.hostname}
                        </Link>
                      </td>
                      <td className="muted">{g.os_make} {g.os_version}</td>
                      <td>
                        {p.is_security_update && p.needs_update ? (
                          <span className="badge badge-red">Security</span>
                        ) : p.needs_update ? (
                          <span className="badge badge-amber">Update Available</span>
                        ) : (
                          <span className="badge badge-green">Up to Date</span>
                        )}
                      </td>
                      <td>
                        {cves.length > 0 ? (
                          <div className="flex" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {cves.slice(0, 4).map((c) => (
                              <span key={c} className="badge badge-red" style={{ fontSize: 10.5 }}>{c}</span>
                            ))}
                            {cves.length > 4 && <span className="muted">+{cves.length - 4}</span>}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: '#0a0f1c', fontSize: 12, color: 'var(--text-dim)' }}>
          {(report && rows.length > 0) ? (
            <span>{rows.length} unique package{rows.length === 1 ? '' : 's'}</span>
          ) : <span />}
          <button type="button" className="btn btn-sm" onClick={() => navigate('/packages')}>
            Back to Packages
          </button>
        </div>
      </div>
    </div>
  )
}