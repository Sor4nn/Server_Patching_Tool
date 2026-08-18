import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { DonutChart } from '../components/DonutChart'
import { IconFileText } from '../components/Icons'
import type { HostGroup, SecurityHostRow, SecurityReport } from '../types'

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function statusBadge(status: SecurityHostRow['status']) {
  if (status === 'up_to_date') return <span className="badge badge-green">Patched</span>
  if (status === 'needs_updates') return <span className="badge badge-amber">Needs updates</span>
  return <span className="badge badge-red">Not reporting</span>
}

export default function SecurityReporting() {
  const [report, setReport] = useState<SecurityReport | null>(null)
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [status, setStatus] = useState('')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState('')

  const params = () => {
    const q = new URLSearchParams()
    if (status) q.set('status', status)
    if (groupId) q.set('group_id', groupId)
    const s = q.toString()
    return s ? `?${s}` : ''
  }

  const load = async () => {
    try {
      const [r, g] = await Promise.all([api.securityReport(params()), api.listGroups()])
      setReport(r)
      setGroups(g.groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    }
  }

  useEffect(() => { load() }, [status, groupId])

  const exportCsv = async () => {
    try {
      const csv = await api.securityReportCsv(params())
      download(`security-report-${report?.generated_at?.slice(0, 10) || 'snapshot'}.csv`, csv, 'text/csv')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export CSV')
    }
  }

  const exportJson = () => {
    if (!report) return
    download(`security-report-${report.generated_at.slice(0, 10)}.json`, JSON.stringify(report, null, 2), 'application/json')
  }

  const s = report?.summary

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Security Reporting</h1>
          <p className="page-sub">Are my VMs patched? Fleet patch posture, readable as a dashboard, table, CSV and JSON.</p>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={exportJson} disabled={!report}>
            <IconFileText size={13} /> Download JSON
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv} disabled={!report}>
            <IconFileText size={13} /> Download CSV
          </button>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="flex" style={{ gap: 10, marginBottom: 14 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All statuses</option>
          <option value="up_to_date">Patched</option>
          <option value="needs_updates">Needs updates</option>
          <option value="not_reporting">Not reporting</option>
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div className="top-stats-row">
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Total Hosts</span></div>
          <div className="top-stat-value">{s?.total_hosts ?? '—'}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Patched</span></div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>{s?.up_to_date ?? '—'}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Needs Updates</span></div>
          <div className="top-stat-value" style={{ color: 'var(--amber)' }}>{s?.needs_updates ?? '—'}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Not Reporting</span></div>
          <div className="top-stat-value" style={{ color: 'var(--red)' }}>{s?.not_reporting ?? '—'}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Security Updates</span></div>
          <div className="top-stat-value" style={{ color: 'var(--red)' }}>{s?.security_updates ?? '—'}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span>Patch Coverage</span></div>
          <div className="top-stat-value">{s?.patch_coverage_pct !== undefined ? `${s.patch_coverage_pct}%` : '—'}</div>
        </div>
      </div>

      <div className="widgets-grid-3" style={{ marginTop: 16 }}>
        <div className="widget-card">
          <div className="widget-header"><h3 className="widget-title">Patch Posture</h3></div>
          <div className="widget-body">
            <DonutChart
              size={150}
              segments={[
                { label: 'Patched', value: s?.up_to_date ?? 0, color: '#22c55e' },
                { label: 'Needs updates', value: s?.needs_updates ?? 0, color: '#f59e0b' },
                { label: 'Not reporting', value: s?.not_reporting ?? 0, color: '#ef4444' },
              ]}
            />
          </div>
          <div className="widget-footer-link" style={{ textAlign: 'center' }}>{s?.hosts_with_cves ?? 0} hosts with known CVEs · {s?.outdated_packages ?? 0} outdated packages</div>
        </div>

        <div className="widget-card">
          <div className="widget-header"><h3 className="widget-title">By Host Group</h3></div>
          <div className="widget-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>GROUP</th><th>TOTAL</th><th>PATCHED</th><th>UPDATES</th><th>OFFLINE</th></tr></thead>
                <tbody>
                  {report?.groups.map((g) => (
                    <tr key={g.name}>
                      <td>{g.name}</td><td>{g.total}</td>
                      <td style={{ color: 'var(--green)' }}>{g.up_to_date}</td>
                      <td style={{ color: 'var(--amber)' }}>{g.needs_updates}</td>
                      <td style={{ color: 'var(--red)' }}>{g.not_reporting}</td>
                    </tr>
                  ))}
                  {report?.groups.length === 0 && <tr><td colSpan={5} className="muted">No hosts.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header"><h3 className="widget-title">By OS</h3></div>
          <div className="widget-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>OS</th><th>TOTAL</th><th>PATCHED</th><th>UPDATES</th><th>OFFLINE</th></tr></thead>
                <tbody>
                  {report?.os.map((o) => (
                    <tr key={o.name}>
                      <td>{o.name}</td><td>{o.total}</td>
                      <td style={{ color: 'var(--green)' }}>{o.up_to_date}</td>
                      <td style={{ color: 'var(--amber)' }}>{o.needs_updates}</td>
                      <td style={{ color: 'var(--red)' }}>{o.not_reporting}</td>
                    </tr>
                  ))}
                  {report?.os.length === 0 && <tr><td colSpan={5} className="muted">No hosts.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="flex flex-between mb">
          <h3 className="card-title" style={{ margin: 0 }}>Host Patch Status</h3>
          <span className="muted" style={{ fontSize: 11 }}>Generated {report ? new Date(report.generated_at).toLocaleString() : '…'} · {report?.hosts.length ?? 0} hosts</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>HOST</th><th>GROUP</th><th>OS</th><th>STATUS</th>
                <th>OUTDATED</th><th>SECURITY</th><th>CVEs</th><th>REBOOT</th><th>LAST SEEN</th><th>LAST PATCH</th>
              </tr>
            </thead>
            <tbody>
              {report?.hosts.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link to={`/hosts/${h.id}`} className="mono" style={{ color: '#60a5fa', fontWeight: 600 }}>
                      {h.friendly_name || h.hostname}
                    </Link>
                  </td>
                  <td>{h.group_name || <span className="muted">—</span>}</td>
                  <td className="muted">{h.os_make || '?'}{h.os_version ? ` ${h.os_version}` : ''}</td>
                  <td>{statusBadge(h.status)}</td>
                  <td>{h.outdated_count > 0 ? <strong style={{ color: 'var(--amber)' }}>{h.outdated_count}</strong> : 0}</td>
                  <td>{h.security_count > 0 ? <strong style={{ color: 'var(--red)' }}>{h.security_count}</strong> : 0}</td>
                  <td title={h.cve_packages || ''}>{h.cve_count > 0 ? <strong style={{ color: 'var(--red)' }}>{h.cve_count}</strong> : 0}</td>
                  <td>{h.needs_reboot ? <span className="badge badge-amber">Reboot</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{h.last_seen ? new Date(h.last_seen).toLocaleString() : 'never'}</td>
                  <td className="muted">{h.latest_patch || '—'}</td>
                </tr>
              ))}
              {report?.hosts.length === 0 && (
                <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 24 }}>No hosts match this view. Sync a repository or add hosts to see patch posture.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}