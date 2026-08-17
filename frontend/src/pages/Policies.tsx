import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { Host, HostGroup, JobTemplate, PatchPolicy } from '../types'
import { IconPlus } from '../components/Icons'

type DelayType = PatchPolicy['patch_delay_type']

function delayLabel(p: PatchPolicy) {
  switch (p.patch_delay_type) {
    case 'immediate': return 'Immediate'
    case 'delayed': return `${p.delay_minutes ?? 0} min delay`
    case 'fixed_time': return `Daily ${p.fixed_time_utc} UTC`
    default: return p.patch_delay_type
  }
}

export default function Policies() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [policies, setPolicies] = useState<PatchPolicy[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<PatchPolicy | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const [p, h, g, t] = await Promise.all([
      api.listPolicies().catch(() => ({ success: false, policies: [] })),
      api.listHosts().catch(() => ({ success: false, hosts: [] })),
      api.listGroups().catch(() => ({ success: false, groups: [] })),
      api.listTemplates().catch(() => ({ success: false, templates: [] })),
    ])
    setPolicies(p.policies || [])
    setHosts(h.hosts || [])
    setGroups(g.groups || [])
    setTemplates((t as { templates?: JobTemplate[] }).templates || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (p: PatchPolicy) => {
    if (!window.confirm(`Delete policy "${p.name}"?`)) return
    try {
      await api.deletePolicy(p.id)
      setMessage(`Deleted "${p.name}"`)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patch Policies & Automation</h1>
          <p className="page-sub">Schedule and target automated patch orchestration runs</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Policy
          </button>
        )}
      </div>

      {message && <div className="login-error" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }}>{message}</div>}

      <div className="card">
        {policies.length === 0 ? (
          <p className="muted">No policies created yet. Create one to schedule automated patching runs.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Policy Name</th><th>When</th><th>Targets</th><th>Exclusions</th><th>Next Run</th><th>State</th>{isAdmin && <th />}</tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name}</div>
                      {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
                    </td>
                    <td>{delayLabel(p)}</td>
                    <td>
                      {p.assignments.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        p.assignments.map((a) => (
                          <span key={a.id} className="badge badge-blue" style={{ margin: '0 4px 4px 0' }}>
                            {a.target_type === 'host_group'
                              ? `Group #${a.target_id}`
                              : `Host #${a.target_id}`}
                          </span>
                        ))
                      )}
                    </td>
                    <td>{p.exclusions.length || '—'}</td>
                    <td className="mono muted">{p.next_run_at ? p.next_run_at.replace('T', ' ').slice(0, 16) : '—'}</td>
                    <td>
                      {p.enabled ? <span className="badge badge-green">Enabled</span> : <span className="badge badge-gray">Disabled</span>}
                    </td>
                    {isAdmin && (
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(p)}>Edit</button>{' '}
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(p)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <PolicyModal
          policy={editing}
          hosts={hosts}
          groups={groups}
          templates={templates}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onDone={(msg) => {
            setShowCreate(false)
            setEditing(null)
            setMessage(msg)
            load()
          }}
        />
      )}
    </div>
  )
}

function PolicyModal({ policy, hosts, groups, templates, onClose, onDone }: {
  policy: PatchPolicy | null
  hosts: Host[]
  groups: HostGroup[]
  templates: JobTemplate[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [name, setName] = useState(policy?.name || '')
  const [description, setDescription] = useState(policy?.description || '')
  const [delayType, setDelayType] = useState<DelayType>(policy?.patch_delay_type || 'immediate')
  const [delayMinutes, setDelayMinutes] = useState(String(policy?.delay_minutes ?? 60))
  const [fixedTime, setFixedTime] = useState(policy?.fixed_time_utc || '03:00')
  const [templateId, setTemplateId] = useState(String(policy?.template_id ?? ''))
  const [enabled, setEnabled] = useState(policy ? policy.enabled === 1 : true)
  const [targetType, setTargetType] = useState('host_group')
  const [targetId, setTargetId] = useState('')
  const [excludeHost, setExcludeHost] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        patch_delay_type: delayType,
        delay_minutes: delayType === 'delayed' ? Number(delayMinutes) || null : null,
        fixed_time_utc: delayType === 'fixed_time' ? fixedTime : null,
        template_id: templateId ? Number(templateId) : null,
        enabled,
      }
      let id = policy?.id
      if (policy) {
        await api.updatePolicy(policy.id, body)
      } else {
        const res = await api.createPolicy(body)
        id = res.policy.id
      }
      if (targetId && id) {
        await api.addPolicyAssignment(id, { target_type: targetType, target_id: Number(targetId) })
      }
      if (excludeHost && id) {
        await api.addPolicyExclusion(id, Number(excludeHost))
      }
      onDone(`Saved "${name}"`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setBusy(false)
    }
  }

  const addTarget = () => {
    if (!targetId || !policy) return
    api.addPolicyAssignment(policy.id, { target_type: targetType, target_id: Number(targetId) })
      .then(() => { setTargetId(''); onDone('Target added') })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }

  const addExclusion = () => {
    if (!excludeHost || !policy) return
    api.addPolicyExclusion(policy.id, Number(excludeHost))
      .then(() => { setExcludeHost(''); onDone('Exclusion added') })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>{policy ? `Edit ${policy.name}` : 'New Policy'}</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={save}>
          <div className="form-row">
            <label>Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Schedule</label>
            <select value={delayType} onChange={(e) => setDelayType(e.target.value as DelayType)}>
              <option value="immediate">Immediate (manual trigger)</option>
              <option value="delayed">Delayed (minutes)</option>
              <option value="fixed_time">Fixed time (daily, UTC)</option>
            </select>
          </div>
          {delayType === 'delayed' && (
            <div className="form-row">
              <label>Delay (minutes)</label>
              <input type="number" min={1} value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} />
            </div>
          )}
          {delayType === 'fixed_time' && (
            <div className="form-row">
              <label>Time (UTC, HH:MM)</label>
              <input value={fixedTime} onChange={(e) => setFixedTime(e.target.value)} />
            </div>
          )}

          <div className="form-row">
            <label>Job Template (used when the policy fires)</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">None — manual only</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
            </select>
          </div>

          {!policy ? (
            <>
              <div className="form-row">
                <label>Target</label>
                <div className="flex">
                  <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ maxWidth: 180 }}>
                    <option value="host_group">Host Group</option>
                    <option value="host">Host</option>
                  </select>
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">Select…</option>
                    {targetType === 'host_group'
                      ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)
                      : hosts.map((h) => <option key={h.id} value={h.id}>{h.hostname}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <label>Exclude host</label>
                <select value={excludeHost} onChange={(e) => setExcludeHost(e.target.value)}>
                  <option value="">None</option>
                  {hosts.map((h) => <option key={h.id} value={h.id}>{h.hostname}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <label>Current targets</label>
                <div>
                  {policy.assignments.map((a) => (
                    <span key={a.id} className="badge badge-blue" style={{ margin: '0 4px 4px 0' }}>
                      {a.target_type}: #{a.target_id}
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', marginLeft: 6 }}
                        onClick={() => api.removePolicyAssignment(policy.id, a.id).then(() => onDone('Target removed')).catch(() => {})}
                      >×</button>
                    </span>
                  ))}
                  {policy.assignments.length === 0 && <span className="muted">None</span>}
                </div>
              </div>
              <div className="form-row">
                <label>Add target</label>
                <div className="flex">
                  <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ maxWidth: 180 }}>
                    <option value="host_group">Host Group</option>
                    <option value="host">Host</option>
                  </select>
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">Select…</option>
                    {targetType === 'host_group'
                      ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)
                      : hosts.map((h) => <option key={h.id} value={h.id}>{h.hostname}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={addTarget}>Add</button>
                </div>
              </div>
              <div className="form-row">
                <label>Exclusions</label>
                <div>
                  {policy.exclusions.map((x) => (
                    <span key={x.id} className="badge badge-red" style={{ margin: '0 4px 4px 0' }}>
                      Host #{x.host_id}
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', marginLeft: 6 }}
                        onClick={() => api.removePolicyExclusion(policy.id, x.id).then(() => onDone('Exclusion removed')).catch(() => {})}
                      >×</button>
                    </span>
                  ))}
                  {policy.exclusions.length === 0 && <span className="muted">None</span>}
                </div>
              </div>
              <div className="form-row">
                <label>Add exclusion</label>
                <div className="flex">
                  <select value={excludeHost} onChange={(e) => setExcludeHost(e.target.value)}>
                    <option value="">Select host…</option>
                    {hosts.map((h) => <option key={h.id} value={h.id}>{h.hostname}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={addExclusion}>Exclude</button>
                </div>
              </div>
            </>
          )}

          <div className="form-row">
            <label className="flex" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : policy ? 'Save Changes' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
