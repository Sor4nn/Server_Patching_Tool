import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { AwxJob, AwxTemplate, ExecutionOption, Host, PatchRun } from '../types'
import { IconPlay, IconPlus } from '../components/Icons'

function HealthDot({ health }: { health: { success: boolean; version?: string; auth_mode?: string; connection_name?: string; connection_id?: number } | null }) {
  if (!health) return <span className="badge badge-gray">Checking AWX status…</span>
  if (!health.success) return <span className="badge badge-red">AWX Unreachable</span>
  return (
    <span className="flex">
      <span className="status-pill dot-green" />
      <span className="badge badge-green">AWX v{health.version || '?'} Online</span>
      {health.auth_mode && <span className="badge badge-blue">{health.auth_mode === 'token' ? 'Bearer Token' : 'Basic Auth'}</span>}
      {health.connection_name && <span className="badge badge-gray">via {health.connection_name}</span>}
    </span>
  )
}

function runTone(status: string) {
  const s = (status || '').toLowerCase()
  if (['successful', 'completed'].includes(s)) return 'badge-green'
  if (['failed', 'canceled', 'cancelled', 'error'].includes(s)) return 'badge-red'
  if (['running', 'pending'].includes(s)) return 'badge-amber'
  return 'badge-gray'
}

export default function Integration() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [health, setHealth] = useState<{ success: boolean; version?: string; auth_mode?: string; connection_name?: string; connection_id?: number } | null>(null)
  const [templates, setTemplates] = useState<AwxTemplate[]>([])
  const [jobs, setJobs] = useState<AwxJob[]>([])
  const [runs, setRuns] = useState<PatchRun[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [options, setOptions] = useState<ExecutionOption[]>([])
  const [showTrigger, setShowTrigger] = useState(false)
  const [showOption, setShowOption] = useState(false)
  const [editingOption, setEditingOption] = useState<ExecutionOption | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [h, t, j, r, hs, o] = await Promise.all([
      api.awxHealth().catch(() => ({ success: false })),
      api.awxTemplates().catch(() => ({ success: false, templates: [] })),
      api.awxJobs().catch(() => ({ success: false, jobs: [] })),
      api.listRuns().catch(() => ({ success: false, runs: [] })),
      api.listHosts().catch(() => ({ success: false, hosts: [] })),
      api.listOptions().catch(() => ({ success: false, options: [] })),
    ])
    setHealth(h)
    setTemplates((t as { templates?: AwxTemplate[] }).templates || [])
    setJobs((j as { jobs?: AwxJob[] }).jobs || [])
    setRuns((r as { runs?: PatchRun[] }).runs || [])
    setHosts((hs as { hosts?: Host[] }).hosts || [])
    setOptions((o as { options?: ExecutionOption[] }).options || [])
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
          <h1 className="page-title">Integration & Orchestration</h1>
          <p className="page-sub">AWX / Tower connection, execution options, and job history</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowTrigger(true)} disabled={!templates.length}>
            <IconPlay size={14} /> Trigger Run
          </button>
        )}
      </div>

      <div className="card mb flex flex-between">
        <div className="flex">
          <HealthDot health={health} />
          {health?.success && <span className="muted">· {templates.length} job templates detected</span>}
        </div>
        <button type="button" className="btn btn-sm" onClick={load}>Refresh</button>
      </div>

      <div className="card mb">
        <div className="flex flex-between">
          <h2 className="card-title" style={{ margin: 0 }}>Execution Options</h2>
          {isAdmin && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => { setEditingOption(null); setShowOption(true) }}>
              <IconPlus size={13} /> Add Option
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 6, marginBottom: 16 }}>
          Configure orchestration endpoints (URL + basic/token auth) and select the active execution engine.
        </p>
        {options.length === 0 ? (
          <p className="muted">No options configured yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Provider</th><th>URL</th><th>Auth</th><th>Active</th>{isAdmin && <th />}</tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{o.name}</td>
                    <td><span className="badge badge-gray">{o.provider}</span></td>
                    <td className="mono muted">{o.url}</td>
                    <td>
                      {o.auth_mode === 'token'
                        ? <span className="badge badge-blue">Bearer Token</span>
                        : <span className="badge badge-blue">Basic Auth</span>}
                    </td>
                    <td>{o.is_active === 1 ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    {isAdmin && (
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        {o.is_active !== 1 && (
                          <button type="button" className="btn btn-sm" onClick={async () => {
                            await api.activateOption(o.id)
                            load()
                          }}>Activate</button>
                        )}{' '}
                        <button type="button" className="btn btn-sm" onClick={async () => {
                          const res = await api.testOption(o.id)
                          setMessage(res.success ? `OK: ${o.name} — AWX v${res.version}` : `Test failed: ${o.name} — ${res.error}`)
                        }}>Test</button>{' '}
                        <button type="button" className="btn btn-sm" onClick={() => { setEditingOption(o); setShowOption(true) }}>Edit</button>{' '}
                        <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
                          if (!window.confirm(`Delete option "${o.name}"?`)) return
                          await api.deleteOption(o.id)
                          load()
                        }}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message && <div className="login-error" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }}>{message}</div>}

      <div className="card mb">
        <h2 className="card-title">AWX Job Templates</h2>
        {templates.length === 0 ? (
          <p className="muted">No templates available — please verify that AWX endpoint is configured and reachable.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Playbook</th><th>Status</th></tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted">{t.id}</td>
                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{t.name}</td>
                    <td className="mono muted">{t.playbook}</td>
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
            <p className="muted">No runs executed yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Run ID</th><th>Template</th><th>Status</th><th>Hosts</th><th>By</th></tr>
                </thead>
                <tbody>
                  {runs.slice(0, 15).map((r) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ color: '#60a5fa' }}>{r.run_id}</td>
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
            <p className="muted">No jobs recorded.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Status</th><th>Started</th></tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 15).map((j) => (
                    <tr key={j.id}>
                      <td className="mono muted">{j.id}</td>
                      <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{j.name}</td>
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

      {showOption && (
        <OptionModal
          option={editingOption}
          onClose={() => setShowOption(false)}
          onDone={(msg) => {
            setShowOption(false)
            setEditingOption(null)
            setMessage(msg)
            load()
          }}
        />
      )}
    </div>
  )
}

function OptionModal({ option, onClose, onDone }: {
  option: ExecutionOption | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [name, setName] = useState(option?.name || '')
  const [provider, setProvider] = useState(option?.provider || 'awx')
  const [url, setUrl] = useState(option?.url || '')
  const [authMode, setAuthMode] = useState<'basic' | 'token'>(option?.auth_mode || 'basic')
  const [username, setUsername] = useState(option?.username || '')
  const [password, setPassword] = useState(option?.password || '')
  const [token, setToken] = useState(option?.token || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = { name, provider, url, auth_mode: authMode }
      if (authMode === 'basic') {
        body.username = username || null
        body.password = password || null
      } else {
        body.token = token || null
      }
      if (option) {
        await api.updateOption(option.id, body)
        onDone(`Saved option "${name}"`)
      } else {
        await api.createOption(body)
        onDone(`Added option "${name}"`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{option ? `Edit ${option.name}` : 'Add Execution Option'}</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary AWX" />
          </div>
          <div className="form-row">
            <label>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="awx">AWX / Ansible Automation Platform</option>
              <option value="jenkins">Jenkins</option>
            </select>
          </div>
          <div className="form-row">
            <label>API URL *</label>
            <input required placeholder="https://awx.example.com:8443" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Auth mode</label>
            <select value={authMode} onChange={(e) => setAuthMode(e.target.value as 'basic' | 'token')}>
              <option value="basic">Basic (username / password)</option>
              <option value="token">Bearer Token</option>
            </select>
          </div>
          {authMode === 'basic' ? (
            <>
              <div className="form-row">
                <label>Username</label>
                <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Password</label>
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="form-row">
              <label>Token</label>
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : option ? 'Save Changes' : 'Add Option'}
            </button>
          </div>
        </form>
      </div>
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
            <label>Hosts (leave empty for all estate hosts)</label>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8, background: 'var(--bg-input)' }}>
              {hosts.map((h) => (
                <label key={h.id} className="flex" style={{ padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selected.includes(h.id)}
                    onChange={() => toggle(h.id)}
                  />
                  <span>{h.friendly_name || h.hostname} <span className="muted mono">({h.ip_address || 'no IP'})</span></span>
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
