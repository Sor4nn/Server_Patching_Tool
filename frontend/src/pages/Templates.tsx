import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { ButtonBinding, Credential, ExecutionEnvironment, Host, JobTemplate } from '../types'
import { IconPlay, IconPlus, IconTrash, IconEdit } from '../components/Icons'

const ACTION_BUTTONS = [
  { key: 'snapshot', label: 'Snapshot' },
  { key: 'apply', label: 'Patching' },
  { key: 'check_packages', label: 'Check Packages' },
  { key: 'pending_update', label: 'Pending Update' },
]

export default function Templates() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [buttons, setButtons] = useState<ButtonBinding[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTpl, setEditTpl] = useState<JobTemplate | null>(null)
  const [runTpl, setRunTpl] = useState<JobTemplate | null>(null)

  const load = async () => {
    try {
      const [t, h, b] = await Promise.all([api.listTemplates(), api.listHosts(), api.listButtons()])
      setTemplates(t.templates)
      setHosts(h.hosts)
      setButtons(b.buttons || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const bind = async (key: string, templateId: number | null, label: string) => {
    setError('')
    setMessage('')
    try {
      await api.bindButton(key, { template_id: templateId, button_label: label })
      setMessage(`Bound "${label}" button`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bind failed')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this template?')) return
    try {
      await api.deleteTemplate(id)
      setTemplates(templates.filter((t) => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-sub">Playbooks from git repos, run against one or more hosts</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Template
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}
      {message && <div className="login-error" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.4)' }}>{message}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>PLAYBOOK</th>
                <th>REPO / BRANCH</th>
                <th>CREDENTIAL</th>
                <th>EXEC ENV</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{t.name}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{t.playbook}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{t.repo_url} <span className="badge badge-gray">{t.branch}</span></td>
                  <td>{t.credential ? <span className="badge badge-blue">{t.credential.name}</span> : <span className="muted">default</span>}</td>
                  <td>{t.execution_environment ? <span className="badge badge-purple">{t.execution_environment.name}</span> : <span className="muted">default</span>}</td>
                  <td>{t.enabled ? <span className="badge badge-green">Enabled</span> : <span className="badge badge-gray">Disabled</span>}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-sm btn-primary" disabled={!t.enabled} onClick={() => setRunTpl(t)}>
                      <IconPlay size={12} /> Run
                    </button>
                    {isAdmin && (
                      <>
                        <button type="button" className="btn btn-sm" onClick={() => setEditTpl(t)} title="Edit template">
                          <IconEdit size={13} />
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(t.id)} title="Delete template">
                          <IconTrash size={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No templates yet. Create one to run a playbook against your hosts.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="card mt">
          <h2 className="card-title">Customize Action Buttons</h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 16 }}>
            Bind templates to the patching actions used on the Run page (Snapshot / Patching / Check Packages / Pending Update).
          </p>
          {ACTION_BUTTONS.map((ab) => {
            const binding = buttons.find((b) => b.button_key === ab.key)
            return (
              <div key={ab.key} className="flex flex-between mb" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <div style={{ fontWeight: 600, minWidth: 170 }}>{ab.label}</div>
                <select
                  value={binding?.template_id ?? ''}
                  onChange={(e) => bind(ab.key, e.target.value ? Number(e.target.value) : null, ab.label)}
                  style={{ maxWidth: 420 }}
                >
                  <option value="">— none —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
                </select>
                {binding?.template_id && (
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => bind(ab.key, null, ab.label)}>Unbind</button>
                )}
              </div>
            )
          })}
          {templates.length === 0 && <p className="muted">No templates found — sync a repo or create one.</p>}
        </div>
      )}

      {showCreate && <CreateTemplateModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {editTpl && <EditTemplateModal key={editTpl.id} template={editTpl} onClose={() => setEditTpl(null)} onSaved={load} />}
      {runTpl && <RunTemplateModal key={runTpl.id} template={runTpl} hosts={hosts} onClose={() => setRunTpl(null)} />}
    </div>
  )
}

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  return <TemplateFormModal mode="create" onClose={onClose} onDone={onCreated} />
}

function EditTemplateModal({ template, onClose, onSaved }: { template: JobTemplate; onClose: () => void; onSaved: () => void }) {
  return <TemplateFormModal mode="edit" template={template} onClose={onClose} onDone={onSaved} />
}

function TemplateFormModal({ mode, template, onClose, onDone }: {
  mode: 'create' | 'edit'
  template?: JobTemplate
  onClose: () => void
  onDone: () => void
}) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({
    name: template?.name || '',
    description: template?.description || '',
    playbook: template?.playbook || 'ansible_scripts/collect_packages.yml',
    repo_url: template?.repo_url || '',
    branch: template?.branch || 'main',
    credential_id: template?.credential_id ? String(template.credential_id) : '',
    execution_environment_id: template?.execution_environment_id ? String(template.execution_environment_id) : '',
    enabled: template ? !!template.enabled : true,
  })
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [environments, setEnvironments] = useState<ExecutionEnvironment[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.listCredentials(), api.listEnvironments()])
      .then(([c, e]) => { setCredentials(c.credentials); setEnvironments(e.environments) })
      .catch(() => {})
  }, [])

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name || !form.repo_url) return
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description || null,
        playbook: form.playbook,
        repo_url: form.repo_url,
        branch: form.branch,
        credential_id: form.credential_id ? Number(form.credential_id) : null,
        execution_environment_id: form.execution_environment_id ? Number(form.execution_environment_id) : null,
        enabled: form.enabled ? 1 : 0,
      }
      if (isEdit && template) {
        await api.updateTemplate(template.id, body)
      } else {
        await api.createTemplate(body)
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ marginBottom: 12 }}>{isEdit ? 'Edit Template' : 'New Template'}</h3>
        {error && <div className="login-error">{error}</div>}
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Collect package inventory" />
        <label className="form-label">Repository URL *</label>
        <input className="form-input mono" value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="https://github.com/user/playbooks.git" />
        <div className="form-row-2">
          <div>
            <label className="form-label">Playbook path</label>
            <input className="form-input mono" value={form.playbook} onChange={(e) => set('playbook', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Branch</label>
            <input className="form-input mono" value={form.branch} onChange={(e) => set('branch', e.target.value)} />
          </div>
        </div>
        <div className="form-row-2">
          <div>
            <label className="form-label">Credential</label>
            <select className="form-input" value={form.credential_id} onChange={(e) => set('credential_id', e.target.value)}>
              <option value="">Default (system)</option>
              {credentials.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Execution environment</label>
            <select className="form-input" value={form.execution_environment_id} onChange={(e) => set('execution_environment_id', e.target.value)}>
              <option value="">Default</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
        <label className="form-label">Description</label>
        <input className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} />
        <label className="checkbox-row" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Enabled
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Template')}
          </button>
        </div>
      </div>
    </div>
  )
}

function RunTemplateModal({ template, hosts, onClose }: { template: JobTemplate; hosts: Host[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [extraVars, setExtraVars] = useState('')
  const [result, setResult] = useState<{ success: boolean; run: unknown; output: string; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const launch = async () => {
    if (selected.size === 0) return
    setBusy(true)
    setResult(null)
    try {
      const res = await api.runTemplate(template.id, { host_ids: [...selected], extra_vars: extraVars || undefined })
      setResult({
        success: res.success,
        run: res.run,
        output: res.local?.output || (res.success ? 'Run launched successfully.' : (res.error || 'Run failed')),
        error: res.error,
      })
    } catch (e) {
      setResult({ success: false, run: null, output: '', error: e instanceof Error ? e.message : 'Run failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ marginBottom: 12 }}>Run “{template.name}”</h3>
        <p className="page-sub" style={{ marginBottom: 10 }}>
          <span className="mono">{template.playbook}</span> · <span className="mono">{template.repo_url}</span>
        </p>
        <label className="form-label">Target hosts (pick one or more)</label>
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 8 }}>
          {hosts.map((h) => (
            <label key={h.id} className="checkbox-row" style={{ padding: '4px 6px' }}>
              <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
              <span style={{ fontWeight: 500 }}>{h.friendly_name || h.hostname}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{h.ip_address || h.hostname}</span>
            </label>
          ))}
          {hosts.length === 0 && <div className="muted" style={{ padding: 8 }}>No hosts yet — add one on the Hosts page.</div>}
        </div>
        <label className="form-label" style={{ marginTop: 10 }}>Extra vars (JSON, optional)</label>
        <textarea className="form-input mono" rows={3} value={extraVars} onChange={(e) => setExtraVars(e.target.value)} placeholder='{"ansible_become_pass": ""}' />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={launch} disabled={busy || selected.size === 0}>
            <IconPlay size={12} /> {busy ? 'Running…' : `Run on ${selected.size} host${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
        {result && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className={`badge ${result.success ? 'badge-green' : 'badge-red'}`} style={{ marginBottom: 8 }}>
              {result.success ? 'Run launched' : 'Run failed'}
            </div>
            {result.error && <div className="login-error" style={{ marginBottom: 8 }}>{result.error}</div>}
            {result.output && (
              <pre className="mono" style={{ maxHeight: 240, overflow: 'auto', fontSize: 10.5, whiteSpace: 'pre-wrap' }}>{result.output.slice(-4000)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}