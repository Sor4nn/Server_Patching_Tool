import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Host, PatchRun } from '../types'

interface Stats {
  total_hosts: number
  total_groups: number
  total_users: number
  total_runs: number
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{value}</div>
    </div>
  )
}

function runStatusTone(status: string) {
  const s = (status || '').toLowerCase()
  if (['successful', 'completed'].includes(s)) return 'badge-green'
  if (['failed', 'canceled', 'cancelled'].includes(s)) return 'badge-red'
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
          <p className="page-sub">Overview of your patching estate</p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Hosts" value={stats?.total_hosts ?? 0} tone="blue" />
        <StatCard label="Host Groups" value={stats?.total_groups ?? 0} tone="green" />
        <StatCard label="Patch Runs" value={stats?.total_runs ?? 0} tone="amber" />
        <StatCard label="Users" value={stats?.total_users ?? 0} tone="gray" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Recent Patch Runs</h2>
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
                      <td className="mono">{r.run_id}</td>
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
          <div className="mt"><Link to="/patching" className="btn btn-sm">View Patching →</Link></div>
        </div>

        <div className="card">
          <h2 className="card-title">Recently Updated Hosts</h2>
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
                      <td><Link to={`/hosts/${h.id}`} className="muted">{h.hostname}</Link></td>
                      <td>{[h.os_make, h.os_version].filter(Boolean).join(' ') || '-'}</td>
                      <td>{h.latest_patch || '-'}</td>
                      <td>{h.state ? <span className={`badge ${h.state === 'Blocked' ? 'badge-red' : 'badge-green'}`}>{h.state}</span> : <span className="badge badge-gray">Unknown</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt"><Link to="/hosts" className="btn btn-sm">View Hosts →</Link></div>
        </div>
      </div>
    </div>
  )
}
