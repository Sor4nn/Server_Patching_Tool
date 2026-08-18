import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Host, HostGroup, JobTemplate, PatchPolicy, PolicyAssignment } from '../types'
import { IconPlus } from '../components/Icons'

type WhenType = 'fixed_time' | 'delayed'

function whenLabel(p: PatchPolicy) {
  if (p.patch_delay_type === 'fixed_time') return `Daily ${p.fixed_time_utc} UTC`
  if (p.patch_delay_type === 'delayed') return `${p.delay_minutes ?? 0} min after trigger`
  return 'Immediate'
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function Schedules() {
  const [schedules, setSchedules] = useState<PatchPolicy[]>([])
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<PatchPolicy | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const [p, t, h, g] = await Promise.all([
      api.listPolicies().catch(() => ({ success: false, policies: [] })),
      api.listTemplates().catch(() => ({ success: false, templates: [] })),
      api.listHosts().catch(() => ({ success: false, hosts: [] })),
      api.listGroups().catch(() => ({ success: false, groups: [] })),
    ])
    setSchedules(p.policies || [])
    setTemplates(t.templates || [])
    setHosts(h.hosts || [])
    setGroups(g.groups || [])
  }, [])

  useEffect(() => { load() }, [load])

  const hostById = useMemo(() => {
    const m = new Map<number, Host>()
    hosts.forEach((x) => m.set(x.id, x))
    return m
  }, [hosts])
  const groupById = useMemo(() => {
    const m = new Map<number, HostGroup>()
    groups.forEach((x) => m.set(x.id, x))
    return m
  }, [groups])

  const templateById = useMemo(() => {
    const m = new Map<number, JobTemplate>()
    templates.forEach((x) => m.set(x.id, x))
    return m
  }, [templates])

  const targetLabel = (a: PolicyAssignment) => {
    if (a.target_type === 'host_group') {
      const g = groupById.get(a.target_id)
      return g ? g.name : `Group #${a.target_id}`
    }
    const h = hostById.get(a.target_id)
    return h ? (h.friendly_name || h.hostname) : `Host #${a.target_id}`
  }

  const remove = async (s: PatchPolicy) => {
    if (!window.confirm(`Delete schedule "${s.name}"?`)) return
    try {
      await api.deletePolicy(s.id)
      setMessage(`Deleted "${s.name}"`)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const toggleEnabled = async (s: PatchPolicy) => {
    try {
      await api.updatePolicy(s.id, { enabled: s.enabled !== 1 })
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="page-sub">Schedule job templates to run automatically at set times</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <IconPlus size={14} /> New Schedule
        </button>
      </div>

      {message && <div className="login-error" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }}>{message}</div>}

      <div className="card">
        {schedules.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>No schedules yet. Create one to run a template on a set schedule.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Template</th>
                  <th>When</th>
                  <th>Targets</th>
                  <th>Next Run</th>
                  <th>Last Run</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const tpl = s.template_id ? templateById.get(s.template_id) : undefined
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{s.name}</div>
                        {s.description && <div className="muted" style={{ fontSize: 12 }}>{s.description}</div>}
                      </td>
                      <td>
                        {tpl ? (
                          <span style={{ color: '#60a5fa' }}>{tpl.name}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{whenLabel(s)}</td>
                      <td>
                        {s.assignments.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          s.assignments.map((a) => (
                            <span key={a.id} className="badge badge-blue" style={{ margin: '0 4px 4px 0' }}>
                              {targetLabel(a)}
                            </span>
                          ))
                        )}
                      </td>
                      <td className="mono muted">{fmt(s.next_run_at)}</td>
                      <td className="mono muted">{fmt(s.last_run_at)}</td>
                      <td>
                        {s.enabled ? <span className="badge badge-green">Enabled</span> : <span className="badge badge-gray">Disabled</span>}
                      </td>
                      <td className="text-right" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(s)}>Edit</button>{' '}
                        <button type="button" className="btn btn-sm" onClick={() => toggleEnabled(s)}>
                          {s.enabled ? 'Disable' : 'Enable'}
                        </button>{' '}
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s)}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <ScheduleModal
          schedule={editing}
          templates={templates}
          hosts={hosts}
          groups={groups}
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

function ScheduleModal({ schedule, templates, hosts, groups, onClose, onDone }: {
  schedule: PatchPolicy | null
  templates: JobTemplate[]
  hosts: Host[]
  groups: HostGroup[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [name, setName] = useState(schedule?.name || '')
  const [description, setDescription] = useState(schedule?.description || '')
  const [templateId, setTemplateId] = useState(String(schedule?.template_id ?? ''))
  const [whenType, setWhenType] = useState<WhenType>(schedule?.patch_delay_type === 'delayed' ? 'delayed' : 'fixed_time')
  const [fixedTime, setFixedTime] = useState(schedule?.fixed_time_utc || '03:00')
  const [delayMinutes, setDelayMinutes] = useState(String(schedule?.delay_minutes ?? 60))
  const [enabled, setEnabled] = useState(schedule ? schedule.enabled === 1 : true)
  const [selectedGroups, setSelectedGroups] = useState<number[]>(
    schedule ? schedule.assignments.filter((a) => a.target_type === 'host_group').map((a) => a.target_id) : [],
  )
  const [selectedHosts, setSelectedHosts] = useState<number[]>(
    schedule ? schedule.assignments.filter((a) => a.target_type === 'host').map((a) => a.target_id) : [],
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (arr: number[], setter: (v: number[]) => void, id: number) => {
    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        patch_delay_type: whenType === 'delayed' ? 'delayed' : 'fixed_time',
        delay_minutes: whenType === 'delayed' ? Number(delayMinutes) || null : null,
        fixed_time_utc: whenType === 'fixed_time' ? fixedTime : null,
        template_id: templateId ? Number(templateId) : null,
        enabled,
      }
      let id = schedule?.id
      if (schedule) {
        await api.updatePolicy(schedule.id, body)
      } else {
        const res = await api.createPolicy(body)
        id = res.policy.id
      }
      if (id) {
        const keep = new Set<string>([...selectedGroups.map((g) => `host_group:${g}`), ...selectedHosts.map((h) => `host:${h}`)])
        const before = schedule ? new Set(schedule.assignments.map((a) => `${a.target_type}:${a.target_id}`)) : new Set<string>()
        for (const a of schedule?.assignments || []) {
          if (!keep.has(`${a.target_type}:${a.target_id}`)) {
            await api.removePolicyAssignment(id, a.id)
          }
        }
        for (const key of keep) {
          if (!before.has(key)) {
            const [targetType, targetId] = key.split(':')
            await api.addPolicyAssignment(id, { target_type: targetType, target_id: Number(targetId) })
          }
        }
      }
      onDone(`Saved schedule "${name}"`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 580 }} onClick={(e) => e.stopPropagation()}>
        <h3>{schedule ? `Edit ${schedule.name}` : 'New Schedule'}</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={save}>
          <div className="form-row">
            <label>Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly security patching" />
          </div>
          <div className="form-row">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Template *</label>
            <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>When</label>
            <select value={whenType} onChange={(e) => setWhenType(e.target.value as WhenType)}>
              <option value="fixed_time">Daily at set time</option>
              <option value="delayed">Minutes after enable</option>
            </select>
          </div>
          {whenType === 'fixed_time' ? (
            <div className="form-row">
              <label>Time (UTC, HH:MM)</label>
              <input value={fixedTime} onChange={(e) => setFixedTime(e.target.value)} placeholder="03:00" />
            </div>
          ) : (
            <div className="form-row">
              <label>Delay (minutes)</label>
              <input type="number" min={1} value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} />
            </div>
          )}

          <div className="form-row">
            <label>Target host groups</label>
            {groups.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>No groups.</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {groups.map((g) => (
                  <label key={g.id} className="flex" style={{ gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={selectedGroups.includes(g.id)}
                      onChange={() => toggle(selectedGroups, setSelectedGroups, g.id)}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <label>Target hosts</label>
            {hosts.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>No hosts.</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', maxHeight: 120, overflowY: 'auto' }}>
                {hosts.map((h) => (
                  <label key={h.id} className="flex" style={{ gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={selectedHosts.includes(h.id)}
                      onChange={() => toggle(selectedHosts, setSelectedHosts, h.id)}
                    />
                    {h.friendly_name || h.hostname}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <label className="flex" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : schedule ? 'Save Changes' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}