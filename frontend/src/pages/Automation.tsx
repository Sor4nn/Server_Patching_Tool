import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconBot,
  IconClock,
  IconCheckCircle,
  IconShield,
  IconPlus,
} from '../components/Icons'

export default function Automation() {
  const [activeTab, setActiveTab] = useState<'rules' | 'webhooks' | 'schedule'>('rules')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Automation & Orchestration</h1>
          <p className="page-sub">Event-driven patch policies, auto-remediation triggers, and webhook alerts</p>
        </div>
        <Link to="/automation-options" className="btn btn-primary btn-sm">
          <IconPlus size={14} /> New Policy
        </Link>
      </div>

      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconBot size={16} /></span>
            <span>Active Automation Rules</span>
          </div>
          <div className="top-stat-value">2</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
            <span>Triggered (24h)</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>3</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconShield size={16} /></span>
            <span>Security Auto-Apply</span>
          </div>
          <div className="top-stat-value">Enabled</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconClock size={16} /></span>
            <span>Next Scheduled Run</span>
          </div>
          <div className="top-stat-value" style={{ fontSize: 16 }}>03:00 UTC</div>
        </div>
      </div>

      <div className="sub-tabs-bar">
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Automation Policies
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'webhooks' ? 'active' : ''}`}
          onClick={() => setActiveTab('webhooks')}
        >
          Webhooks & Integrations
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Maintenance Windows
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">Automation Schedules</h3>
        <table style={{ margin: 0 }}>
          <thead>
            <tr><th>POLICY</th><th>TARGETS</th><th>SCHEDULE</th><th>STATUS</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, color: '#f1f5f9' }}>Daily Security Patching</td>
              <td>All Connected Hosts</td>
              <td className="mono muted">Daily 03:00 UTC</td>
              <td><span className="badge badge-green">Active</span></td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#f1f5f9' }}>Pre-Patch Snapshot Automation</td>
              <td>Production Webservers</td>
              <td className="mono muted">Prior to patch apply</td>
              <td><span className="badge badge-green">Active</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
