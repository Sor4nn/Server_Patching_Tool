import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Host, PatchRun } from '../types'
import {
  IconServer,
  IconRepo,
  IconBandage,
  IconSettings,
} from '../components/Icons'

interface Stats {
  total_hosts: number
  total_groups: number
  total_users: number
  total_runs: number
}

function runStatusTone(status: string) {
  const s = (status || '').toLowerCase()
  if (['successful', 'completed'].includes(s)) return 'badge-green'
  if (['failed', 'canceled', 'cancelled', 'error'].includes(s)) return 'badge-red'
  if (['running', 'pending'].includes(s)) return 'badge-amber'
  return 'badge-gray'
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentRuns, setRecentRuns] = useState<PatchRun[]>([])
  const [recentHosts, setRecentHosts] = useState<Host[]>([])

  useEffect(() => {
    api.dashboardStats().then((res) => {
      setStats(res.stats)
      setRecentRuns(res.recent_runs)
      setRecentHosts(res.recent_hosts)
    }).catch(() => {})
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Overview of your patching estate and infrastructure health</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Total Hosts</div>
            <span className="text-blue"><IconServer size={18} /></span>
          </div>
          <div className="stat-value blue">{stats?.total_hosts ?? 0}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Host Groups</div>
            <span style={{ color: 'var(--green)' }}><IconRepo size={18} /></span>
          </div>
          <div className="stat-value green">{stats?.total_groups ?? 0}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Patch Runs</div>
            <span style={{ color: 'var(--amber)' }}><IconBandage size={18} /></span>
          </div>
          <div className="stat-value amber">{stats?.total_runs ?? 0}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Users</div>
            <span style={{ color: 'var(--purple)' }}><IconSettings size={18} /></span>
          </div>
          <div className="stat-value purple">{stats?.total_users ?? 0}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="flex flex-between mb">
            <h2 className="card-title" style={{ margin: 0 }}>Recent Patch Runs</h2>
            <Link to="/patching" className="btn btn-sm">View Patching →</Link>
          </div>
          {recentRuns.length === 0 ? (
            <p className="muted">No patch runs yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Run ID</th><th>Template</th><th>Status</th><th>Hosts</th><th>When</th></tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ color: '#60a5fa' }}>{r.run_id}</td>
                      <td>{r.template_name || '-'}</td>
                      <td><span className={`badge ${runStatusTone(r.status)}`}>{r.status}</span></td>
                      <td>{r.host_count}</td>
                      <td className="muted">{r.created_at.slice(0, 19).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex flex-between mb">
            <h2 className="card-title" style={{ margin: 0 }}>Recently Updated Hosts</h2>
            <Link to="/hosts" className="btn btn-sm">View Hosts →</Link>
          </div>
          {recentHosts.length === 0 ? (
            <p className="muted">No hosts yet. Add your first host.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Hostname</th><th>OS</th><th>Latest Patch</th><th>State</th></tr>
                </thead>
                <tbody>
                  {recentHosts.map((h) => (
                    <tr key={h.id}>
                      <td><Link to={`/hosts/${h.id}`} style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>{h.friendly_name || h.hostname}</Link></td>
                      <td>{[h.os_make, h.os_version].filter(Boolean).join(' ') || '-'}</td>
                      <td className="mono muted">{h.latest_patch || '-'}</td>
                      <td>{h.state ? <span className={`badge ${h.state === 'Blocked' ? 'badge-red' : 'badge-green'}`}>{h.state}</span> : <span className="badge badge-gray">Unknown</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
