import { useState } from 'react'
import {
  IconShield,
  IconCheckCircle,
  IconAlertTriangle,
  IconXCircle,
  IconPlay,
  IconRefresh,
} from '../components/Icons'

export default function Compliance() {
  const [activeTab, setActiveTab] = useState<'overview' | 'scans' | 'profiles'>('overview')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance & Benchmarks</h1>
          <p className="page-sub">Security benchmarks, CIS compliance scanning, and hardening status</p>
        </div>
        <div className="flex">
          <button type="button" className="btn btn-primary btn-sm">
            <IconPlay size={14} /> Run Benchmark Scan
          </button>
          <button type="button" className="btn btn-sm">
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span>
            <span>Compliant Hosts</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span>
            <span>Warnings</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--amber)' }}>0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--red)' }}><IconXCircle size={16} /></span>
            <span>Critical Failures</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--red)' }}>0</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconShield size={16} /></span>
            <span>Unscanned</span>
          </div>
          <div className="top-stat-value">2</div>
        </div>
      </div>

      <div className="sub-tabs-bar">
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'scans' ? 'active' : ''}`}
          onClick={() => setActiveTab('scans')}
        >
          Scan Results
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
          onClick={() => setActiveTab('profiles')}
        >
          Benchmark Profiles
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">Compliance Profiles in Use</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
          No compliance profile scans recorded yet. Trigger a scan against connected hosts to evaluate against CIS Benchmark Level 1 & Level 2 profiles.
        </p>

        <div style={{ background: '#0a0f1c', border: '1px solid var(--border)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
          <IconShield size={36} style={{ color: '#60a5fa', marginBottom: 8 }} />
          <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Ready for Security Benchmark Scanning</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Select hosts to initiate CIS hardening audit and automated remediation playbooks.
          </div>
        </div>
      </div>
    </div>
  )
}
