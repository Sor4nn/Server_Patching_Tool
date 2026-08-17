import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { Credential } from '../types'
import { IconPlus, IconTrash } from '../components/Icons'

export default function Credentials() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await api.listCredentials()
      setCredentials(res.credentials)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const remove = async (id: number) => {
    if (!confirm('Delete this credential? Templates using it will stop working.')) return
    try {
      await api.deleteCredential(id)
      setCredentials(credentials.filter((c) => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Credentials</h1>
          <p className="page-sub">SSH logins used by templates to run playbooks on target hosts</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Credential
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>TYPE</th>
                <th>USERNAME</th>
                <th>DESCRIPTION</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{c.name}</td>
                  <td>
                    <span className="badge badge-blue">{c.credential_type === 'ssh_key' ? 'SSH key' : 'SSH password'}</span>
                  </td>
                  <td className="mono muted">{c.username || '-'}</td>
                  <td className="muted">{c.description || '-'}</td>
                  {isAdmin && (
                    <td className="text-right">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c.id)} title="Delete credential">
                        <IconTrash size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {credentials.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="muted" style={{ textAlign: 'center', padding: 24 }}>No credentials yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateCredentialModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function CreateCredentialModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    credential_type: 'ssh_password',
    username: '',
    password: '',
    private_key: '',
    description: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name) return
    setBusy(true)
    setError('')
    try {
      await api.createCredential({
        name: form.name,
        credential_type: form.credential_type,
        username: form.username || null,
        password: form.credential_type === 'ssh_password' ? form.password || null : null,
        private_key: form.credential_type === 'ssh_key' ? form.private_key || null : null,
        description: form.description || null,
      })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const isKey = form.credential_type === 'ssh_key'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ marginBottom: 12 }}>New Credential</h3>
        {error && <div className="login-error">{error}</div>}
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. prod-ssh" />
        <label className="form-label">Type</label>
        <select className="form-input" value={form.credential_type} onChange={(e) => set('credential_type', e.target.value)}>
          <option value="ssh_password">SSH password</option>
          <option value="ssh_key">SSH private key</option>
        </select>
        <label className="form-label">Username</label>
        <input className="form-input" value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="e.g. root" />
        {!isKey ? (
          <>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </>
        ) : (
          <>
            <label className="form-label">Private key</label>
            <textarea className="form-input mono" rows={7} value={form.private_key} onChange={(e) => set('private_key', e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
          </>
        )}
        <label className="form-label">Description</label>
        <input className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}