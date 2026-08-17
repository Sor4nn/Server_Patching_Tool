import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { AwxJob, AwxTemplate, Host, PatchRun } from '../types'

function HealthDot({ health }: { health: { success: boolean; version?: string; auth_mode?: string } | null }) {
  if (!health) return <span className="badge badge-gray">Checking…</span>
  if (!health.success) return <span className="badge badge-red">AWX Unreachable</span>
  return (
    <span className="flex">
      <span className="status-pill dot-green" />
      <span className="badge badge-green">AWX v{health.version || '?'} Online</span>
      {health.auth_mode && <span className="badge badge-blue">{health.auth_mode === 'token' ? 'Bearer Token' : 'Basic Auth'}</span>}
    </span>
  )
}

function runTone(status: string) {
  const s = (status || '').toLowerCase()
  if (['successful', 'completed'].includes(s)) return 'badge-green'
  if (['failed', 'canceled', 'cancelled'].includes(s)) return 'badge-red'
  if (['running', 'pending'].includes(s)) return 'badge-amber'
  return 'badge-gray'
}

export default function Patching() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [health, setHealth] = useState<{ success: boolean; version?: string; auth_mode?: string } | null>(null)
  const [templates, setTemplates] = useState<AwxTemplate[]>([])
  const [jobs, setJobs] = useState<AwxJob[]>([])
  const [runs, setRuns] = useState<PatchRun[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [showTrigger, setShowTrigger] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [h, t, j, r, hs] = await Promise.all([
      api.awxHealth().catch(() => ({ success: false })),
      api.awxTemplates().catch(() => ({ success: false, templates: [] })),
      api.awxJobs().catch(() => ({ success: false, jobs: [] })),
      api.listRuns().catch(() => ({ success: false, runs: [] })),
      api.listHosts().catch(() => ({ success: false, hosts: [] })),
    ])
    setHealth(h)
    setTemplates((t as { templates?: AwxTemplate[] }).templates || [])
    setJobs((j as { jobs?: AwxJob[] }).jobs || [])
    setRuns((r as { runs?: PatchRun[] }).runs || [])
    setHosts((hs as { hosts?: Host[] }).hosts || [])
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      api.awxJobs().then((res) => {
        if (res.success && res.jobs) setJobs(res.jobs)
      }).catch(() => {})
      api.listRuns().then((res) => setRuns(res.runs)).catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patching</h1>
          <p className="page-sub">AWX orchestration</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowTrigger(true)} disabled={!templates.length}>
            ▶ Trigger Run
          </button>
        )}
      </div>

      <div className="card mb flex flex-between">
        <div className="flex">
          <HealthDot health={health} />
          {health?.success && <span className="muted">· {templates.length} job templates</span>}
        </div>
        <button className="btn btn-sm" onClick={load}>Refresh</button>
      </div>

      {message && <div className="login-error">{message}</div>}

      <div className="card mb">
        <h2 className="card-title">AWX Job Templates</h2>
        {templates.length === 0 ? (
          <p className="muted">No templates available — is AWX reachable?</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Playbook</th><th>Status</th></tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td>{t.name}</td>
                    <td className="mono">{t.playbook}</td>
                    <td><span className={`badge ${t.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Recent Patch Runs</h2>
          {runs.length === 0 ? (
            <p className="muted">No runs yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Run ID</th><th>Template</th><th>Status</th><th>Hosts</th><th>By</th></tr>
                </thead>
                <tbody>
                  {runs.slice(0, 15).map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.run_id}</td>
                      <td>{r.template_name || '-'}</td>
                      <td><span className={`badge ${runTone(r.status)}`}>{r.status}</span></td>
                      <td>{r.host_count}</td>
                      <td className="muted">{r.created_by || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">AWX Jobs (auto-refresh 15s)</h2>
          {jobs.length === 0 ? (
            <p className="muted">No jobs.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Status</th><th>Started</th></tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 15).map((j) => (
                    <tr key={j.id}>
                      <td className="mono">{j.id}</td>
                      <td>{j.name}</td>
                      <td><span className={`badge ${runTone(j.status)}`}>{j.status}</span></td>
                      <td className="muted">{(j.started || '').slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showTrigger && (
        <TriggerModal
          templates={templates}
          hosts={hosts}
          onClose={() => setShowTrigger(false)}
          onDone={(msg) => {
            setShowTrigger(false)
            setMessage(msg)
            load()
          }}
        />
      )}
    </div>
  )
}

function TriggerModal({ templates, hosts, onClose, onDone }: {
  templates: AwxTemplate[]
  hosts: Host[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [templateId, setTemplateId] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [extraVars, setExtraVars] = useState('{}')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (id: number) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.triggerRun({
        template_id: Number(templateId),
        host_ids: selected.length ? selected : undefined,
        extra_vars: extraVars.trim() || '{}',
      })
      onDone(res.success
        ? `Run ${res.run.run_id} triggered${res.awx?.job_id ? ` — AWX job #${res.awx.job_id}` : ''}`
        : (res.error || 'Trigger failed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trigger failed')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Trigger Patch Run</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Job Template *</label>
            <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Hosts (leave empty for all)</label>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {hosts.map((h) => (
                <label key={h.id} className="flex" style={{ padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selected.includes(h.id)}
                    onChange={() => toggle(h.id)}
                  />
                  {h.hostname}
                </label>
              ))}
              {hosts.length === 0 && <span className="muted">No hosts registered.</span>}
            </div>
          </div>
          <div className="form-row">
            <label>Extra Vars (JSON)</label>
            <textarea className="mono" value={extraVars} onChange={(e) => setExtraVars(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Triggering…' : 'Launch Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
