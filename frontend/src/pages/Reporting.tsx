import { useState } from 'react'
import {
  IconClock,
  IconCheckCircle,
  IconAlertTriangle,
  IconRefresh,
} from '../components/Icons'

export default function Reporting() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'history' | 'audit'>('alerts')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reporting & Alerts</h1>
          <p className="page-sub">System alert history, automated reports, and audit logs</p>
        </div>
        <div className="flex">
          <button type="button" className="btn btn-sm">
            <IconRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
            <span>Active Alerts</span>
          </div>
          <div className="top-stat-value">0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--red)' }}><IconClock size={16} /></span>
            <span>Critical Severity</span>
          </div>
          <div className="top-stat-value">0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconClock size={16} /></span>
            <span>Warnings</span>
          </div>
          <div className="top-stat-value">0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
            <span>Resolved Today</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>1</div>
        </div>
      </div>

      <div className="sub-tabs-bar">
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          Recent Alerts
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Alert Volume Trend
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Logs
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ margin: 0 }}>
          <thead>
            <tr style={{ background: '#0a0f1c' }}>
              <th>SEVERITY</th>
              <th>ALERT DESCRIPTION</th>
              <th>HOST / TARGET</th>
              <th>TIME</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-amber">warning</span></td>
              <td style={{ fontWeight: 600 }}>Host agent down: 192.168.1.214</td>
              <td className="mono muted">192.168.1.214</td>
              <td className="muted">about 1 hour ago</td>
              <td><span style={{ color: 'var(--green)', fontWeight: 600 }}>● Resolved</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
