import { useState } from 'react'
import { api } from '../api'

export default function CreateSourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    repo_url: '',
    branch: 'main',
    auth_type: 'none',
    username: '',
    password: '',
    token: '',
    file_pattern: '**/*',
    playbook_pattern: 'ansible_scripts/*.yml',
    prune_missing: false,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await api.createSource(form)
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ marginBottom: 12 }}>New Repository</h3>
        <p className="page-sub" style={{ marginBottom: 10 }}>
          Point at a git repository holding hosts/groups (INI or YAML files), AWX-inventory style. On sync the hosts and playbooks are imported and kept in sync automatically.
        </p>
        {error && <div className="login-error">{error}</div>}
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="My inventory repo" />
        <label className="form-label">Repository URL</label>
        <input className="form-input" value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="https://github.com/org/inventory.git" />
        <label className="form-label">Branch</label>
        <input className="form-input" value={form.branch} onChange={(e) => set('branch', e.target.value)} />
        <label className="form-label">Auth</label>
        <select className="form-input" value={form.auth_type} onChange={(e) => set('auth_type', e.target.value)}>
          <option value="none">None (public)</option>
          <option value="token">Personal access token</option>
          <option value="userpass">Username / password</option>
          <option value="ssh">SSH key (agent)</option>
        </select>
        {form.auth_type === 'token' && (
          <>
            <label className="form-label">Token</label>
            <input className="form-input" type="password" value={form.token} onChange={(e) => set('token', e.target.value)} />
          </>
        )}
        {form.auth_type === 'userpass' && (
          <>
            <label className="form-label">Username</label>
            <input className="form-input" value={form.username} onChange={(e) => set('username', e.target.value)} />
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </>
        )}
        <label className="form-label">Inventory file pattern (e.g. **/*, inventories/*)</label>
        <input className="form-input" value={form.file_pattern} onChange={(e) => set('file_pattern', e.target.value)} />
        <label className="form-label">Playbook pattern (e.g. ansible_scripts/*.yml, playbooks/*.yml)</label>
        <input className="form-input" value={form.playbook_pattern} onChange={(e) => set('playbook_pattern', e.target.value)} />
        <label className="checkbox-row">
          <input type="checkbox" checked={form.prune_missing} onChange={(e) => set('prune_missing', e.target.checked)} />
          Prune hosts no longer present in the repository
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : 'Add Repository'}
          </button>
        </div>
      </div>
    </div>
  )
}