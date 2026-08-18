import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Host, HostGroup, PatchRun, PatchTreeNode } from '../types'
import {
  IconShield,
  IconTerminal,
  IconPackage,
  IconAlertTriangle,
  IconPlay,
  IconRefresh,
} from '../components/Icons'

const ACTIONS = [
  { key: 'snapshot', label: 'Snapshot', icon: IconShield, hint: 'Take a config/package snapshot' },
  { key: 'patching', label: 'Patching', icon: IconPlay, hint: 'Apply available patches' },
  { key: 'check_packages', label: 'Check Packages', icon: IconPackage, hint: 'Re-scan installed packages' },
  { key: 'pending_update', label: 'Pending Update', icon: IconAlertTriangle, hint: 'Check for pending updates' },
]

function badgeClass(status: string) {
  const s = (status || '').toLowerCase()
  if (['successful', 'completed'].includes(s)) return 'badge-green'
  if (['failed', 'error'].includes(s)) return 'badge-red'
  if (['running', 'pending'].includes(s)) return 'badge-amber'
  return 'badge-gray'
}

export default function PatchingRun() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [tree, setTree] = useState<PatchTreeNode[]>([])
  const [runs, setRuns] = useState<PatchRun[]>([])
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
  const [selectedHosts, setSelectedHosts] = useState<Set<number>>(new Set())
  const [hostInput, setHostInput] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [activeRun, setActiveRun] = useState<PatchRun | null>(null)
  const [output, setOutput] = useState('')
  const [viewingRun, setViewingRun] = useState<PatchRun | null>(null)
  const termRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [h, g, t, r] = await Promise.all([
      api.listHosts().catch(() => ({ success: false, hosts: [] })),
      api.listGroups().catch(() => ({ success: false, groups: [] })),
      api.patchTree().catch(() => ({ success: false, tree: [] })),
      api.listRuns().catch(() => ({ success: false, runs: [] })),
    ])
    setHosts(h.hosts || [])
    setGroups(g.groups || [])
    setTree(t.tree || [])
    setRuns(r.runs || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // host -> pending counts from the patch tree
  const treeMap = useCallback((hostId: number) => {
    const node = tree.find((n) => n.host.id === hostId)
    if (!node) return { newCount: 0, secCount: 0 }
    return {
      newCount: node.new.length,
      secCount: node.new.filter((p) => p.is_security_update).length,
    }
  }, [tree])

  const allHostIds = hosts.map((h) => h.id)
  const visibleHosts = hosts.filter((h) => {
    if (selectedGroups.size === 0) return true
    return h.group_id != null && selectedGroups.has(h.group_id)
  })

  const toggleGroup = (id: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        // group selection adds its hosts
        const members = hosts.filter((h) => h.group_id === id).map((h) => h.id)
        members.forEach((mid) => selectedHosts.add(mid))
        next.add(id)
      }
      return next
    })
    setSelectedHosts(new Set(selectedHosts))
  }

  const toggleHost = (id: number) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisibleHosts = () => {
    const ids = visibleHosts.map((h) => h.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedHosts.has(id))
    setSelectedHosts((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const addHostnames = () => {
    const names = hostInput.split(',').map((s) => s.trim()).filter(Boolean)
    if (names.length === 0) return
    setSelectedHosts((prev) => {
      const next = new Set(prev)
      for (const n of names) {
        const found = hosts.find(
          (h) => h.hostname === n || h.ip_address === n || h.friendly_name === n
        )
        if (found) next.add(found.id)
      }
      return next
    })
    setHostInput('')
    setMessage(`Matched ${names.length} host name(s) — add commas to target several at once`)
  }

  const selectedTargets = [...selectedHosts]

  const launch = async (action: string) => {
    setBusyAction(action)
    setError('')
    setMessage('')
    setViewingRun(null)
    const hostIds = selectedTargets.length ? selectedTargets : allHostIds
    if (hostIds.length === 0) {
      setError('No hosts to run against — add hosts or select a group.')
      setBusyAction('')
      return
    }
    try {
      const res = await api.runAction({
        action,
        host_ids: hostIds,
      })
      if (!res.success || !res.run) {
        setError(res.error || `Could not start ${action}`)
        setBusyAction('')
        return
      }
      setActiveRun(res.run)
      setOutput('')
      setMessage(`${action} started on ${hostIds.length} host(s) — run ${res.run.run_id}`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed to start`)
    } finally {
      setBusyAction('')
    }
  }

  useEffect(() => {
    const id = activeRun?.id
    if (!id) return
    let disposed = false
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = async () => {
      try {
        const res = await api.getRunOutput(id)
        if (disposed) return
        setOutput(res.run?.output || '')
        const status = (res.run?.status || '').toLowerCase()
        if (['successful', 'failed', 'completed', 'error', 'canceled'].includes(status)) {
          if (timer) { clearInterval(timer); timer = null }
          setActiveRun((r) => (r && r.id === id ? { ...r, status: res.run!.status } : r))
          setMessage(`Run finished: ${res.run?.status}`)
          load()
        }
      } catch {
        /* keep polling */
      }
    }
    setOutput('')
    tick()
    timer = setInterval(tick, 1200)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [activeRun?.id, load])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }, [output])

  const viewSaved = async (run: PatchRun) => {
    setViewingRun(run)
    setActiveRun(null)
    setOutput('')
    try {
      const res = await api.getRunOutput(run.id)
      setOutput(res.run?.output || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved output')
    }
  }

  const clearView = () => {
    setViewingRun(null)
    setActiveRun(null)
    setOutput('')
    setMessage('')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Run Patching</h1>
          <p className="page-sub">Pick targets, choose an action, and watch the playbook live — outputs are saved for later review</p>
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
        </div>
      </div>

      {message && <div className="login-error" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.4)' }}>{message}</div>}
      {error && <div className="login-error">{error}</div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* LEFT: targets + actions */}
        <div>
          <div className="card mb">
            <div className="flex flex-between mb">
              <h2 className="card-title" style={{ margin: 0 }}>Targets</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {selectedTargets.length} host{selectedTargets.length === 1 ? '' : 's'} selected
                {selectedTargets.length === 0 && ' (runs against all hosts)'}
              </span>
            </div>

            <label className="form-label">Host groups</label>
            <div className="flex" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {groups.map((g) => {
                const count = hosts.filter((h) => h.group_id === g.id).length
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`btn btn-sm ${selectedGroups.has(g.id) ? 'btn-primary' : ''}`}
                    onClick={() => toggleGroup(g.id)}
                  >
                    {g.name} ({count})
                  </button>
                )
              })}
              {groups.length === 0 && <span className="muted">No groups yet.</span>}
            </div>

            <label className="form-label">Hosts</label>
            <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto', cursor: 'pointer' }}
                        checked={visibleHosts.length > 0 && visibleHosts.every((h) => selectedHosts.has(h.id))}
                        onChange={toggleVisibleHosts}
                      />
                    </th>
                    <th>Host</th>
                    <th>Group</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHosts.map((h) => {
                    const { newCount, secCount } = treeMap(h.id)
                    return (
                      <tr key={h.id}>
                        <td>
                          <input
                            type="checkbox"
                            style={{ width: 'auto', cursor: 'pointer' }}
                            checked={selectedHosts.has(h.id)}
                            onChange={() => toggleHost(h.id)}
                          />
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{h.friendly_name || h.hostname}</span>
                          <span className="muted mono" style={{ marginLeft: 6, fontSize: 11 }}>{h.ip_address || ''}</span>
                        </td>
                        <td className="muted">{h.group?.name || '—'}</td>
                        <td>
                          {newCount > 0 ? (
                            <span className={`badge ${secCount > 0 ? 'badge-red' : 'badge-amber'}`}>
                              {newCount} update{newCount === 1 ? '' : 's'}{secCount > 0 ? ` · ${secCount} sec` : ''}
                            </span>
                          ) : (
                            <span className="badge badge-green">up to date</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {visibleHosts.length === 0 && (
                    <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 16 }}>No hosts match the selected groups.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <label className="form-label" style={{ marginTop: 12 }}>Or type hostnames / IPs (comma-separated)</label>
            <div className="flex" style={{ gap: 8 }}>
              <input
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="srv-prod, 192.168.1.214"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') addHostnames() }}
              />
              <button type="button" className="btn btn-sm" onClick={addHostnames}>Add</button>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Actions</h2>
            <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
              {ACTIONS.map((a) => {
                const Icon = a.icon
                return (
                  <button
                    key={a.key}
                    type="button"
                    className={`btn ${a.key === 'patching' ? 'btn-primary' : a.key === 'snapshot' ? 'btn-danger' : ''}`}
                    disabled={busyAction === a.key}
                    onClick={() => launch(a.key)}
                    title={a.hint}
                  >
                    {busyAction === a.key ? 'Running…' : <><Icon size={14} /> {a.label}</>}
                  </button>
                )
              })}
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Actions run against {selectedTargets.length ? `${selectedTargets.length} selected host(s)` : 'ALL hosts'}.
            </p>
          </div>
        </div>

        {/* RIGHT: live terminal + saved runs */}
        <div>
          <div className="card mb">
            <div className="flex flex-between mb">
              <h2 className="card-title" style={{ margin: 0 }}>
                Playbook Terminal
              </h2>
              <div className="flex" style={{ gap: 8 }}>
                {activeRun && (
                  <span className={`badge ${badgeClass(activeRun.status)}`}>{activeRun.status}</span>
                )}
                {viewingRun && <span className="badge badge-gray">saved output</span>}
                {(activeRun || viewingRun) && (
                  <button type="button" className="btn btn-sm" onClick={clearView}>Clear</button>
                )}
              </div>
            </div>

            {(activeRun || viewingRun) ? (
              <div
                ref={termRef}
                className="mono"
                style={{
                  height: 480,
                  overflow: 'auto',
                  background: '#06070f',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  fontSize: 11.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: '#dbe4f0',
                }}
              >
                {output || 'Waiting for output…'}
              </div>
            ) : (
              <div className="empty-widget-state" style={{ height: 460 }}>
                <IconTerminal size={36} />
                <span>Run an action above to see live playbook output here.</span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex flex-between mb">
              <h2 className="card-title" style={{ margin: 0 }}>Saved Runs</h2>
              <button type="button" className="btn btn-sm" onClick={load}>Refresh</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Hosts</th>
                    <th>When</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 20).map((r) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ color: '#60a5fa' }}>{r.run_id}</td>
                      <td>{r.template_name || r.type || '-'}</td>
                      <td><span className={`badge ${badgeClass(r.status)}`}>{r.status}</span></td>
                      <td>{r.host_count}</td>
                      <td className="muted">{r.created_at.slice(0, 19).replace('T', ' ')}</td>
                      <td className="text-right">
                        <button type="button" className="btn btn-sm" onClick={() => viewSaved(r)}>
                          View output
                        </button>
                      </td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>No runs yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
