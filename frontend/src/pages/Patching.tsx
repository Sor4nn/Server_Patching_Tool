import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { AwxTemplate, ButtonBinding, PatchTreeNode } from '../types'

const DEFAULT_BUTTONS = ['apply', 'snapshot']

function buttonLabel(key: string) {
  if (key === 'apply') return 'Apply'
  if (key === 'snapshot') return 'Snapshot'
  return key
}

export default function Patching() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [tree, setTree] = useState<PatchTreeNode[]>([])
  const [buttons, setButtons] = useState<ButtonBinding[]>([])
  const [templates, setTemplates] = useState<AwxTemplate[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [t, b, tmpl] = await Promise.all([
      api.patchTree().catch(() => ({ success: false, tree: [] })),
      api.listButtons().catch(() => ({ success: false, buttons: [] })),
      api.awxTemplates().catch(() => ({ success: false, templates: [] })),
    ])
    setTree(t.tree || [])
    setButtons(b.buttons || [])
    setTemplates((tmpl as { templates?: AwxTemplate[] }).templates || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const bindingFor = useMemo(() => {
    const map = new Map<string, ButtonBinding>()
    for (const b of buttons) map.set(b.button_key, b)
    return map
  }, [buttons])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(tree.map((n) => n.host.id)))
  const selectNone = () => setSelected(new Set())

  const runButton = async (key: string) => {
    setBusyKey(key)
    setError('')
    const binding = bindingFor.get(key)
    if (!binding?.template_id) {
      setError(`No template bound to the "${buttonLabel(key)}" button — bind one in the panel below first.`)
      setBusyKey('')
      return
    }
    const hostIds = selected.size ? [...selected] : []
    try {
      const res = await api.triggerButton(key, hostIds)
      setMessage(res.success
        ? `${buttonLabel(key)} run ${res.run.run_id} triggered${res.awx?.job_id ? ` — AWX job #${res.awx.job_id}` : ''}`
        : (res.error || `${buttonLabel(key)} failed`))
    } catch (err) {
      setError(err instanceof Error ? err.message : `${buttonLabel(key)} failed`)
    } finally {
      setBusyKey('')
    }
  }

  const bind = async (key: string, templateId: number | null) => {
    try {
      await api.bindButton(key, { template_id: templateId, button_label: buttonLabel(key) })
      setMessage(`Bound "${buttonLabel(key)}" button`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bind failed')
    }
  }

  const newCount = tree.reduce((acc, n) => acc + n.new.length, 0)
  const needsUpdateHosts = tree.filter((n) => n.new.length > 0).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patching</h1>
          <p className="page-sub">Patch tree, apply & snapshot actions</p>
        </div>
        <div className="flex">
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {message && <div className="login-error">{message}</div>}
      {error && <div className="login-error">{error}</div>}

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-label">Hosts</div>
          <div className="stat-value">{tree.length}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Hosts Needing Updates</div>
          <div className="stat-value amber">{needsUpdateHosts}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Available Updates</div>
          <div className="stat-value blue">{newCount}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Selected Hosts</div>
          <div className="stat-value">{selected.size}</div>
        </div>
      </div>

      <div className="card mb">
        <div className="flex flex-between mb">
          <h2 className="card-title" style={{ margin: 0 }}>Actions</h2>
          <div className="flex">
            <button className="btn btn-sm" onClick={selectAll}>Select all</button>
            <button className="btn btn-sm" onClick={selectNone}>Clear</button>
          </div>
        </div>
        <div className="flex">
          {DEFAULT_BUTTONS.map((key) => {
            const binding = bindingFor.get(key)
            const hasTemplate = Boolean(binding?.template_id)
            return (
              <button
                key={key}
                className={`btn ${key === 'snapshot' ? 'btn-danger' : 'btn-primary'}`}
                disabled={busyKey === key || !hasTemplate}
                onClick={() => runButton(key)}
                title={hasTemplate ? `Runs template #${binding?.template_id}` : 'Bind a template below first'}
              >
                {busyKey === key ? 'Running…' : key === 'snapshot' ? '📸 Snapshot' : '🩹 Apply'}
              </button>
            )
          })}
          <span className="muted">Run against {selected.size ? `${selected.size} selected host(s)` : 'all hosts'}</span>
        </div>
      </div>

      <div className="card mb">
        <h2 className="card-title">Patch Tree</h2>
        {tree.length === 0 ? (
          <p className="muted">No hosts registered yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th style={{ width: 40 }}></th><th>Host</th><th>Installed</th><th>Available Updates</th><th>Security</th></tr>
              </thead>
              <tbody>
                {tree.map((node) => (
                  <Fragment key={node.host.id}>
                    <tr onClick={() => setExpanded(expanded === node.host.id ? null : node.host.id)} style={{ cursor: 'pointer' }}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={selected.has(node.host.id)}
                          onChange={() => toggle(node.host.id)}
                        />
                      </td>
                      <td>
                        <span className="badge badge-gray" style={{ marginRight: 8 }}>{expanded === node.host.id ? '▾' : '▸'}</span>
                        {node.host.friendly_name || node.host.hostname}
                      </td>
                      <td className="muted">{node.current.length}</td>
                      <td>
                        {node.new.length > 0
                          ? <span className="badge badge-amber">{node.new.length}</span>
                          : <span className="badge badge-green">Up to date</span>}
                      </td>
                      <td>
                        {node.new.some((p) => p.is_security_update)
                          ? <span className="badge badge-red">{node.new.filter((p) => p.is_security_update).length}</span>
                          : <span className="muted">—</span>}
                      </td>
                    </tr>
                    {expanded === node.host.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--bg)', padding: 0 }}>
                          <div style={{ padding: '12px 20px' }}>
                            {node.new.length > 0 && (
                              <>
                                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '8px 0 6px' }}>New patches available</div>
                                <table style={{ margin: 0 }}>
                                  <thead>
                                    <tr><th>Package</th><th>Installed</th><th>Available</th><th>Category</th></tr>
                                  </thead>
                                  <tbody>
                                    {node.new.map((p) => (
                                      <tr key={p.name}>
                                        <td>
                                          {p.name}
                                          {p.is_security_update ? <span className="badge badge-red" style={{ marginLeft: 8 }}>Security</span> : null}
                                        </td>
                                        <td className="mono">{p.version}{p.release ? `-${p.release}` : ''}</td>
                                        <td className="mono">{p.available_version || '—'}</td>
                                        <td className="muted">{p.category || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                            {node.current.length > 0 && (
                              <>
                                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '12px 0 6px' }}>Current patches</div>
                                <table style={{ margin: 0 }}>
                                  <thead>
                                    <tr><th>Package</th><th>Version</th><th>Category</th></tr>
                                  </thead>
                                  <tbody>
                                    {node.current.map((p) => (
                                      <tr key={p.name}>
                                        <td>{p.name}</td>
                                        <td className="mono">{p.version}{p.release ? `-${p.release}` : ''}</td>
                                        <td className="muted">{p.category || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <h2 className="card-title">Customize Buttons</h2>
          <p className="muted" style={{ marginTop: 6 }}>Bind a detected AWX template to each button. The button then triggers that template against the selected hosts.</p>
          {DEFAULT_BUTTONS.map((key) => {
            const binding = bindingFor.get(key)
            return (
              <div key={key} className="flex flex-between mb" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div style={{ fontWeight: 600, minWidth: 120 }}>{buttonLabel(key)}</div>
                <select
                  value={binding?.template_id ?? ''}
                  onChange={(e) => bind(key, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— none —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
                </select>
                {binding?.template_id && (
                  <button className="btn btn-sm" onClick={() => bind(key, null)}>Unbind</button>
                )}
              </div>
            )
          })}
          {templates.length === 0 && <p className="muted">AWX unreachable — no templates listed.</p>}
        </div>
      )}
    </div>
  )
}
