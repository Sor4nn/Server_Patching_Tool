import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { ExecutionEnvironment } from '../types'
import { IconPlus, IconStar, IconTrash } from '../components/Icons'

export default function ExecutionEnvironments() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [environments, setEnvironments] = useState<ExecutionEnvironment[]>([])
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    try {
      const res = await api.listEnvironments()
      setEnvironments(res.environments)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const makeDefault = async (id: number) => {
    setError('')
    try {
      await api.updateEnvironment(id, { is_default: 1 })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this execution environment?')) return
    try {
      await api.deleteEnvironment(id)
      setEnvironments(environments.filter((e) => e.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Execution Environments</h1>
          <p className="page-sub">Container images used to run playbooks for local provider runs</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} /> New Environment
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Image</th><th>Description</th><th>Default</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {environments.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{e.name}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{e.image}</td>
                  <td className="muted">{e.description || '-'}</td>
                  <td>
                    {e.is_default === 1
                      ? <span className="badge badge-green"><IconStar size={11} /> default</span>
                      : isAdmin && (
                          <button type="button" className="btn btn-sm" onClick={() => makeDefault(e.id)} title="Make default">
                            Make default
                          </button>
                        )}
                  </td>
                  {isAdmin && (
                    <td className="text-right">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(e.id)} title="Delete">
                        <IconTrash size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {environments.length === 0 && (
                <tr><td colSpan={isAdmin ? 5 : 4} className="muted">No execution environments yet. The default image is used for local runs.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateEnvModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}

function CreateEnvModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    image: '',
    description: '',
    is_default: false,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await api.createEnvironment({ ...form, description: form.description || null })
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
        <h3 className="page-title" style={{ marginBottom: 12 }}>New Execution Environment</h3>
        {error && <div className="login-error">{error}</div>}
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. zeroops-ee" />
        <label className="form-label">Image</label>
        <input className="form-input" value={form.image} onChange={(e) => set('image', e.target.value)} placeholder="quay.io/ansible/ansible-runner:stable-2.17-latest" />
        <label className="form-label">Description</label>
        <input className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} />
        <label className="checkbox-row">
          <input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)} />
          Use as default for local runs
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}