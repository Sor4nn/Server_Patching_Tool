import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'
import { DonutChart } from '../components/DonutChart'
import type { DashboardResponse, DashboardStats, DashboardSystem } from '../types'
import {
  IconServer,
  IconCheckCircle,
  IconAlertTriangle,
  IconRestart,
  IconPackage,
  IconShield,
  IconUsers,
  IconRepo,
  IconClock,
  IconXCircle,
  IconList,
  IconPlay,
  IconPlayCircle,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
} from '../components/Icons'

const PAGE_SIZE = 8

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [trendRange, setTrendRange] = useState('24h')

  const load = (pageNum = page, status = statusFilter) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) })
    if (status) params.set('status', status)
    api.dashboardStats(`?${params.toString()}`).then((res) => {
      setData(res)
      setPage(pageNum)
      setStatusFilter(status)
    }).catch(() => {})
  }

  useEffect(() => {
    load(0, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats: DashboardStats = data?.stats ?? {
    total_hosts: 0, total_groups: 0, total_users: 0, total_runs: 0,
    up_to_date: 0, needs_updates: 0, not_reporting: 0,
    outdated_packages: 0, security_updates: 0, needs_reboot: 0,
  }
  const systems: DashboardSystem[] = data?.systems ?? []
  const totalSystems = data?.total_systems ?? 0
  const totalPages = Math.max(1, Math.ceil(totalSystems / PAGE_SIZE))

  const updateStatusSegments = [
    { label: 'Up to date', value: stats.up_to_date, color: '#22c55e' },
    { label: 'Needs updates', value: stats.needs_updates, color: '#f59e0b' },
    { label: 'Not reporting', value: stats.not_reporting, color: '#ef4444' },
  ]

  const runOutcomesSegments = [
    { label: 'Completed', value: 2, color: '#22c55e' },
    { label: 'Failed', value: 0, color: '#ef4444' },
    { label: 'Cancelled', value: 0, color: '#8b5cf6' },
    { label: 'Timed out', value: 0, color: '#f59e0b' },
    { label: 'Agent disconnected', value: 0, color: '#f97316' },
  ]

  const runsByTypeSegments = [
    { label: 'Patch All', value: 2, color: '#3b82f6' },
    { label: 'Patch Package', value: 1, color: '#8b5cf6' },
  ]

  const statusBadge = (s: DashboardSystem) => {
    if (s.status === 'up_to_date') return <span className="badge badge-green">Up to date</span>
    if (s.status === 'needs_updates') return <span className="badge badge-amber">Needs updates</span>
    return <span className="badge badge-red">Not reporting</span>
  }

  const pct = (n: number) => (stats.total_hosts ? `${((n / stats.total_hosts) * 100).toFixed(1)}%` : '0%')

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.username || 'test'} 👋</h1>
          <p className="page-sub">Overview of your PatchMon infrastructure</p>
        </div>
        <div className="flex">
          <button type="button" className="btn btn-sm" onClick={() => load()} title="Refresh data">
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {/* Top Stat Cards - Row 1 (5 Cards) */}
      <div className="top-stats-row">
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconServer size={16} /></span>
            <span>Total Hosts</span>
          </div>
          <div className="top-stat-value">{stats.total_hosts}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
            <span>Up to date</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>{stats.up_to_date}</div>
        </div>

        <div className="top-stat-card" style={{ padding: '10px 14px' }}>
          <div className="multi-metric-box">
            <div className="multi-metric-item">
              <strong style={{ color: '#60a5fa' }}>{pct(stats.needs_updates)}</strong>
              <div style={{ fontSize: 9.5 }}>Need Updates {stats.needs_updates}/{stats.total_hosts}</div>
            </div>
            <div className="multi-metric-item">
              <strong style={{ color: '#ef4444' }}>{stats.security_updates}</strong>
              <div style={{ fontSize: 9.5 }}>Security {pct(stats.security_updates)}</div>
            </div>
            <div className="multi-metric-item">
              <strong style={{ color: 'var(--green)' }}>{stats.total_hosts - stats.not_reporting}/{stats.total_hosts}</strong>
              <div style={{ fontSize: 9.5 }}>Reporting</div>
            </div>
            <div className="multi-metric-item">
              <strong className="muted">{stats.total_hosts ? (stats.outdated_packages / stats.total_hosts).toFixed(1) : 0}</strong>
              <div style={{ fontSize: 9.5 }}>Avg/Host outdated</div>
            </div>
          </div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
            <span>Needs Updating</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--amber)' }}>{stats.needs_updates}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconRestart size={16} /></span>
            <span>Needs Reboots</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--amber)' }}>{stats.needs_reboot}</div>
        </div>
      </div>

      {/* Top Stat Cards - Row 2 (6 Cards) */}
      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconPackage size={15} /></span>
            <span>Outdated Packages</span>
          </div>
          <div className="top-stat-value">{stats.outdated_packages}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--red)' }}><IconShield size={15} /></span>
            <span>Security Updates</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--red)' }}>{stats.security_updates}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconUsers size={15} /></span>
            <span>Users</span>
          </div>
          <div className="top-stat-value">{stats?.total_users ?? 2}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconRepo size={15} /></span>
            <span>Host Groups</span>
          </div>
          <div className="top-stat-value">{stats?.total_groups ?? 0}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconShield size={15} /></span>
            <span>Compliance</span>
          </div>
          <div className="top-stat-value" style={{ fontSize: 18 }}>0/0 hosts</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconRepo size={15} /></span>
            <span>Repositories</span>
          </div>
          <div className="top-stat-value">5</div>
        </div>
      </div>

      {/* ROW 1: Update Status, OS Distribution, Package Trends */}
      <div className="widgets-grid-3">
        {/* Widget 1: Update Status */}
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Update Status</h3>
          </div>
          <div className="widget-body">
            <DonutChart segments={updateStatusSegments} size={110} strokeWidth={18} />
          </div>
          <div className="widget-footer-link">
            <Link to="/hosts">View hosts needing updates &gt;</Link>
          </div>
        </div>

        {/* Widget 2: OS Distribution */}
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">OS Distribution</h3>
          </div>
          <div className="widget-body" style={{ padding: '10px 0' }}>
            <div style={{ fontSize: 12, marginBottom: 6, color: '#94a3b8' }}>Red Hat Enterprise Linux 9.8 (Plow)</div>
            <div style={{ height: 26, background: '#3b82f6', borderRadius: 4, width: '100%' }} />
            <div className="flex flex-between muted" style={{ fontSize: 10, marginTop: 4 }}>
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.8</span>
              <span>1.0</span>
            </div>
          </div>
        </div>

        {/* Widget 3: Package Trends Over Time */}
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Package Trends Over Time</h3>
            <div className="flex" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 11 }}>
                <IconRefresh size={12} /> Refresh
              </button>
              <select
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value)}
                style={{ padding: '2px 6px', fontSize: 11, width: 'auto' }}
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
              <select style={{ padding: '2px 6px', fontSize: 11, width: 'auto' }}>
                <option>All Hosts</option>
              </select>
            </div>
          </div>
          <div className="widget-body">
            {/* Legend */}
            <div className="flex" style={{ gap: 14, fontSize: 11, marginBottom: 8, justifyContent: 'center' }}>
              <span className="flex" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /> Total Packages</span>
              <span className="flex" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Outdated</span>
              <span className="flex" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Security</span>
            </div>
            {/* SVG Line chart simulation */}
            <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none">
              <line x1="0" y1="40" x2="300" y2="40" stroke="#1e2d4a" strokeDasharray="3 3" />
              <line x1="0" y1="40" x2="300" y2="40" stroke="#f59e0b" strokeWidth="2" />
              <circle cx="30" cy="40" r="3" fill="#f59e0b" />
              <circle cx="120" cy="40" r="3" fill="#f59e0b" />
              <circle cx="210" cy="40" r="3" fill="#f59e0b" />
              <circle cx="290" cy="40" r="3" fill="#f59e0b" />
            </svg>
            <div className="flex flex-between muted" style={{ fontSize: 10 }}>
              <span>2 PM</span>
              <span>3 PM</span>
              <span>4 PM</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: Host Compliance, Active Scans, Recent Collection, Recent Users */}
      <div className="widgets-grid-4">
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Host Compliance Status</h3>
          </div>
          <div className="widget-body">
            <div className="metrics-2x2">
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
                <div>
                  <div className="metric-label">Compliant</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
                <div>
                  <div className="metric-label">Warning</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--red)' }}><IconXCircle size={16} /></span>
                <div>
                  <div className="metric-label">Critical</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon text-blue"><IconShield size={16} /></span>
                <div>
                  <div className="metric-label">Never scanned</div>
                  <div className="metric-val">{stats.not_reporting}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Active Benchmark Scans</h3>
          </div>
          <div className="widget-body" style={{ textAlign: 'center' }}>
            <span className="muted" style={{ display: 'block', marginBottom: 6 }}><IconShield size={28} /></span>
            <span className="muted" style={{ fontSize: 12 }}>No scans currently running</span>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Systems Patch Status</h3>
            <span className="badge badge-blue">{totalSystems} systems</span>
          </div>
          <div className="widget-body">
            <div className="flex" style={{ gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {['', 'up_to_date', 'needs_updates', 'not_reporting'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`badge ${statusFilter === s ? 'badge-blue' : 'badge-gray'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => load(0, s)}
                >
                  {s === '' ? 'All' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <table style={{ fontSize: 11.5 }}>
              <thead>
                <tr><th>HOST</th><th>OS</th><th>STATUS</th><th>OUTDATED</th><th>LAST SEEN</th></tr>
              </thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/hosts/${s.id}`} className="mono" style={{ color: '#60a5fa' }}>
                        {s.friendly_name || s.hostname}
                      </Link>
                    </td>
                    <td className="muted">{s.os_version || s.os_make || '-'}</td>
                    <td>{statusBadge(s)}</td>
                    <td>{s.outdated_count > 0 ? <strong style={{ color: 'var(--amber)' }}>{s.outdated_count}</strong> : 0}</td>
                    <td className="muted">{s.last_seen ? new Date(s.last_seen).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {systems.length === 0 && (
                  <tr><td colSpan={5} className="muted">No systems in this view.</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex" style={{ gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page === 0}
                onClick={() => load(page - 1)}
              >
                <IconChevronLeft size={12} /> Prev
              </button>
              <span className="muted" style={{ fontSize: 11 }}>
                Page {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page + 1 >= totalPages}
                onClick={() => load(page + 1)}
              >
                Next <IconChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Recent Users Logged In</h3>
            <span className="badge badge-blue">2 users</span>
          </div>
          <div className="widget-body">
            <table style={{ fontSize: 11.5 }}>
              <thead>
                <tr><th>USERNAME</th><th>LAST LOGIN</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>test</td>
                  <td className="muted">just now</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>sor4n</td>
                  <td className="muted">1 hour ago</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ROW 3: Patching Widgets (Status, Outcomes, Pending, Runs by Type) */}
      <div className="widgets-grid-4">
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Patch Run Status</h3>
          </div>
          <div className="widget-body">
            <div className="metrics-2x2">
              <div className="metric-box">
                <span className="metric-icon text-blue"><IconList size={16} /></span>
                <div>
                  <div className="metric-label">Total Runs</div>
                  <div className="metric-val">{stats.total_runs}</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon text-blue"><IconClock size={16} /></span>
                <div>
                  <div className="metric-label">Active</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
                <div>
                  <div className="metric-label">Completed</div>
                  <div className="metric-val">2</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--red)' }}><IconXCircle size={16} /></span>
                <div>
                  <div className="metric-label">Failed</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Run Outcomes</h3>
          </div>
          <div className="widget-body">
            <DonutChart segments={runOutcomesSegments} size={90} strokeWidth={14} />
          </div>
          <div className="widget-footer-link">
            <Link to="/patching">View all runs &gt;</Link>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Pending Approval</h3>
          </div>
          <div className="widget-body">
            <div className="metrics-2x2">
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconClock size={16} /></span>
                <div>
                  <div className="metric-label">Pending Validation</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconCheckCircle size={16} /></span>
                <div>
                  <div className="metric-label">Pending Approval</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
                <div>
                  <div className="metric-label">Awaiting Approval</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--green)' }}><IconPlay size={16} /></span>
                <div>
                  <div className="metric-label">Running</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Runs by Type</h3>
          </div>
          <div className="widget-body">
            <DonutChart segments={runsByTypeSegments} size={90} strokeWidth={14} />
          </div>
          <div className="widget-footer-link">
            <Link to="/patching">View all runs &gt;</Link>
          </div>
        </div>
      </div>

      {/* ROW 4: Active Runs, Recent Runs, Alert Summary, Alerts by Severity */}
      <div className="widgets-grid-4">
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Active Runs</h3>
          </div>
          <div className="widget-body" style={{ textAlign: 'center' }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}><IconPlayCircle size={32} /></span>
            <span className="muted" style={{ fontSize: 12 }}>No active runs</span>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Recent Runs</h3>
          </div>
          <div className="widget-body">
            <table style={{ fontSize: 11.5 }}>
              <thead>
                <tr><th>HOST</th><th>STATUS</th><th>WHEN</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono" style={{ color: '#60a5fa' }}>192.168.1.214</td>
                  <td><span className="badge badge-green">Completed</span></td>
                  <td className="muted">about 3 hours ago</td>
                </tr>
                <tr>
                  <td className="mono" style={{ color: '#60a5fa' }}>192.168.1.214</td>
                  <td><span className="badge badge-green">Completed</span></td>
                  <td className="muted">about 4 hours ago</td>
                </tr>
                <tr>
                  <td className="mono" style={{ color: '#60a5fa' }}>192.168.1.214</td>
                  <td><span className="badge badge-green">Approved</span></td>
                  <td className="muted">about 4 hours ago</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="widget-footer-link">
            <Link to="/patching">View all runs &gt;</Link>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Alert Summary</h3>
          </div>
          <div className="widget-body">
            <div className="metrics-2x2">
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
                <div>
                  <div className="metric-label">Active Alerts</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--red)' }}><IconXCircle size={16} /></span>
                <div>
                  <div className="metric-label">Critical</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--amber)' }}><IconClock size={16} /></span>
                <div>
                  <div className="metric-label">Warnings</div>
                  <div className="metric-val">0</div>
                </div>
              </div>
              <div className="metric-box">
                <span className="metric-icon" style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
                <div>
                  <div className="metric-label">Resolved Today</div>
                  <div className="metric-val">1</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Alerts by Severity</h3>
          </div>
          <div className="widget-body" style={{ textAlign: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>No active alerts</span>
          </div>
          <div className="widget-footer-link">
            <Link to="/reporting">View all alerts &gt;</Link>
          </div>
        </div>
      </div>

      {/* ROW 5: Alert Trends, Alerts by Type, Recent Alerts */}
      <div className="widgets-grid-3">
        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Alert Volume Trend</h3>
            <div className="flex" style={{ gap: 4 }}>
              <span className="badge badge-blue" style={{ cursor: 'pointer' }}>Volume</span>
              <span className="badge badge-gray" style={{ cursor: 'pointer' }}>Severity</span>
              <span className="badge badge-blue" style={{ cursor: 'pointer' }}>7d</span>
            </div>
          </div>
          <div className="widget-body">
            <div className="flex" style={{ gap: 10, fontSize: 11, marginBottom: 8, justifyContent: 'flex-end' }}>
              <span className="flex" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> New Alerts</span>
              <span className="flex" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} /> Resolved</span>
            </div>
            <svg width="100%" height="70" viewBox="0 0 300 70" preserveAspectRatio="none">
              <path d="M0 60 L240 60 L300 10" fill="none" stroke="#ef4444" strokeWidth="2" />
            </svg>
            <div className="flex flex-between muted" style={{ fontSize: 10 }}>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
              <span>Mon</span>
            </div>
          </div>
          <div className="widget-footer-link">
            <Link to="/reporting">View alert history &gt;</Link>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Alerts by Type</h3>
          </div>
          <div className="widget-body">
            <div style={{ fontSize: 11.5, marginBottom: 4, color: '#94a3b8' }}>Host Agent Down</div>
            <div style={{ height: 22, background: '#ef4444', borderRadius: 4, width: '100%' }} />
            <div className="flex flex-between muted" style={{ fontSize: 10, marginTop: 4 }}>
              <span>0</span>
              <span>1</span>
            </div>
          </div>
          <div className="widget-footer-link">
            <Link to="/reporting">View all alerts &gt;</Link>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h3 className="widget-title">Recent Alerts</h3>
          </div>
          <div className="widget-body">
            <table style={{ fontSize: 11.5 }}>
              <thead>
                <tr><th>SEVERITY</th><th>ALERT</th><th>TIME</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="badge badge-amber">warning</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>Host agent down: 192.168.1...</td>
                  <td className="muted">about 1 hour ago</td>
                  <td><span style={{ fontSize: 11, color: 'var(--green)' }}>● Resolve</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="widget-footer-link">
            <Link to="/reporting">View all alerts &gt;</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
