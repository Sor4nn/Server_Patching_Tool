import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

interface FormState {
  name: string
  description: string
  repo_url: string
  branch: string
  auth_type: 'none' | 'token' | 'userpass' | 'ssh'
  username: string
  password: string
  token: string
  file_pattern: string
  playbook_pattern: string
  prune_missing: boolean
  enabled: boolean
}

const EMPTY: FormState = {
  name: '', description: '', repo_url: '', branch: 'main',
  auth_type: 'none', username: '', password: '', token: '',
  file_pattern: '**/*', playbook_pattern: 'ansible_scripts/*.yml',
  prune_missing: false, enabled: true,
}

export default function RepoForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const editId = id ? Number(id) : null
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)

  useEffect(() => {
    if (!editId) return
    (async () => {
      try {
        const res = await api.getSource(editId)
        const s = res.source
        setForm({
          name: s.name, description: s.description || '', repo_url: s.repo_url,
          branch: s.branch, auth_type: s.auth_type,
          username: s.username || '', password: '', token: '',
          file_pattern: s.file_pattern, playbook_pattern: s.playbook_pattern,
          prune_missing: !!s.prune_missing, enabled: !!s.enabled,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load repository')
      } finally { setLoading(false) }
    })()
  }, [editId])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim() || !form.repo_url.trim()) {
      setError('Name and Repository URL are required')
      return
    }
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = {
        name: form.name, description: form.description || null,
        repo_url: form.repo_url, branch: form.branch,
        auth_type: form.auth_type, file_pattern: form.file_pattern,
        playbook_pattern: form.playbook_pattern,
        prune_missing: form.prune_missing, enabled: form.enabled,
      }
      if (form.auth_type === 'token') body.token = form.token || null
      if (form.auth_type === 'userpass') {
        body.username = form.username || null
        if (form.password) body.password = form.password
      }
      if (editId) {
        await api.updateSource(editId, body)
      } else {
        await api.createSource(body)
      }
      navigate('/host-groups')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="boot-screen"><div className="spinner" /></div>

  const crumb = editId ? form.name || 'Edit Repository' : 'New Repository'

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 14, fontSize: 13, color: 'var(--slate)' }}>
        <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => navigate('/host-groups')}>
          Projects
        </span>
        <span style={{ margin: '0 6px', opacity: 0.5 }}>›</span>
        <span style={{ color: '#e2e8f0' }}>{crumb}</span>
      </div>

      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">{editId ? 'Edit Repository' : 'New Repository'}</h1>
          <p className="page-sub">Git-backed inventory source (AWX-inventory style). On sync, hosts and playbooks are imported and kept in sync.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* General Information */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">General Information</h3>
        <div className="form-grid">
          <div className="form-row">
            <label>Name *</label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Atos_a685188_dzarembski" />
          </div>
          <div className="form-row">
            <label>Description</label>
            <input className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="For Tests and Development" />
          </div>
          <div className="form-row">
            <label>Source Control Type</label>
            <select className="form-input" disabled>
              <option>Git</option>
            </select>
          </div>
        </div>
      </div>

      {/* Type Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Type Details (Source Control)</h3>
        <div className="form-grid">
          <div className="form-row">
            <label>Source Control URL *</label>
            <input className="form-input mono" value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="git@github.com:org/repo.git or https://github.com/org/repo.git" />
          </div>
          <div className="form-row">
            <label>Source Control Branch/Tag/Commit</label>
            <input className="form-input mono" value={form.branch} onChange={(e) => set('branch', e.target.value)} placeholder="main" />
          </div>
          <div className="form-row">
            <label>Source Control Credential</label>
            <select className="form-input" value={form.auth_type} onChange={(e) => set('auth_type', e.target.value as FormState['auth_type'])}>
              <option value="none">None (public)</option>
              <option value="token">Personal access token</option>
              <option value="userpass">Username / password</option>
              <option value="ssh">SSH key (agent)</option>
            </select>
          </div>
          {form.auth_type === 'token' && (
            <div className="form-row">
              <label>Token</label>
              <input className="form-input" type="password" value={form.token} onChange={(e) => set('token', e.target.value)} placeholder="github_pat_..." />
            </div>
          )}
          {form.auth_type === 'userpass' && (
            <>
              <div className="form-row">
                <label>Username</label>
                <input className="form-input" value={form.username} onChange={(e) => set('username', e.target.value)} />
              </div>
              <div className="form-row">
                <label>Password {editId && <span className="muted" style={{ fontSize: 11 }}>(leave blank to keep current)</span>}</label>
                <input className="form-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Password" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inventory matching */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Inventory Matching</h3>
        <div className="form-grid">
          <div className="form-row">
            <label>Inventory file pattern</label>
            <input className="form-input mono" value={form.file_pattern} onChange={(e) => set('file_pattern', e.target.value)} placeholder="**/*  or  inventories/*" />
          </div>
          <div className="form-row">
            <label>Playbook pattern</label>
            <input className="form-input mono" value={form.playbook_pattern} onChange={(e) => set('playbook_pattern', e.target.value)} placeholder="ansible_scripts/*.yml  or  playbooks/*.yml" />
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 className="card-title">Options</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.prune_missing} onChange={(e) => set('prune_missing', e.target.checked)} />
            Delete — prune hosts no longer present in the repository
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            Enabled — include this source in scheduled syncs
          </label>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={() => navigate('/host-groups')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
