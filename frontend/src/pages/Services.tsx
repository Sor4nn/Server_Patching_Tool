import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import type { ServiceHost, HostService, HostFilesystem, CriticalService } from '../types'
import { IconRefresh, IconRestart, IconChevronDown, IconChevronRight, IconPlus, IconTrash, IconShield, IconCheckCircle, IconXCircle, IconAlertTriangle } from '../components/Icons'

function fmtKb(kb: number | null): string {
  if (kb == null) return '-'
  const gb = kb / (1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(kb / 1024).toFixed(0)} MB`
}

function ServiceBadge({ svc }: { svc: HostService }) {
  const healthy = svc.healthy
  const isFailed = svc.active_state === 'failed'
  const cls = healthy ? 'badge badge-green' : isFailed ? 'badge badge-red' : 'badge badge-gray'
  const Icon = healthy ? IconCheckCircle : isFailed ? IconXCircle : IconAlertTriangle
  const color = healthy ? 'var(--green)' : isFailed ? 'var(--red)' : 'var(--amber)'
  return (
    <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon size={12} />
      <span style={{ color }}>{svc.active_state || 'unknown'}</span>
      {svc.sub_state && svc.sub_state !== svc.active_state && (
        <span className="muted" style={{ fontSize: 10 }}>/ {svc.sub_state}</span>
      )}
    </span>
  )
}

function FsBar({ fs }: { fs: HostFilesystem }) {
  const pct = fs.use_pct ?? 0
  const danger = pct >= 90
  const warn = pct >= 75 && !danger
  const color = danger ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--green)'
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span className="mono" style={{ color: '#cbd5e1' }}>{fs.mount}</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {fmtKb(fs.used_kb)} / {fmtKb(fs.size_kb)} · <span style={{ color }}>{pct}%</span>
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

export default function Services() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin === 1
  const [hosts, setHosts] = useState<ServiceHost[]>([])
  const [catalog, setCatalog] = useState<CriticalService[]>([])
  const [totals, setTotals] = useState({ hosts: 0, services: 0, failed: 0, critical: 0, critical_failed: 0, fs_over_threshold: 0 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'refresh' | number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showCatalog, setShowCatalog] = useState(false)
  const [newSvc, setNewSvc] = useState('')

  const load = async () => {
    try {
      const [svc, cat] = await Promise.all([api.listServices(), api.listServiceCatalog()])
      setHosts(svc.hosts)
      setTotals(svc.totals)
      setCatalog(cat.services)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load services')
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const refreshAll = async () => {
    setBusy('refresh'); setError('')
    try {
      const res = await api.refreshServices()
      if (!res.success) throw new Error(res.error || 'Refresh failed')
      setTimeout(load, 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    } finally { setBusy(null) }
  }

  const refreshHost = async (hostId: number) => {
    setBusy(hostId); setError('')
    try {
      const res = await api.refreshServices([hostId])
      if (!res.success) throw new Error(res.error || 'Refresh failed')
      setTimeout(load, 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    } finally { setBusy(null) }
  }

  const restart = async (hostId: number, service: string) => {
    if (!confirm(`Restart ${service} on ${hosts.find((h) => h.id === hostId)?.hostname}?`)) return
    setBusy(hostId); setError('')
    try {
      const res = await api.restartService([hostId], service)
      if (!res.success) throw new Error(res.error || 'Restart failed')
      setTimeout(load, 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restart failed')
    } finally { setBusy(null) }
  }

  const addCatalog = async () => {
    if (!newSvc.trim()) return
    try {
      await api.addServiceCatalog({ name: newSvc.trim() })
      setNewSvc('')
      const cat = await api.listServiceCatalog()
      setCatalog(cat.services)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    }
  }

  const delCatalog = async (id: number, name: string) => {
    if (!confirm(`Remove ${name} from critical catalog?`)) return
    try {
      await api.deleteServiceCatalog(id)
      const cat = await api.listServiceCatalog()
      setCatalog(cat.services)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-sub">Critical systemd services and filesystem usage across managed systems</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button type="button" className="btn btn-sm" onClick={() => setShowCatalog(!showCatalog)}>
              <IconShield size={14} /> Catalog
            </button>
          )}
          {isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={refreshAll} disabled={busy === 'refresh'}>
              <IconRefresh size={14} /> {busy === 'refresh' ? 'Refreshing…' : 'Refresh All'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      {showCatalog && isAdmin && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-title">Critical Service Catalog</h3>
          <p className="page-sub" style={{ margin: '0 0 10px' }}>Services watched on every refresh. Add or remove entries below.</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="e.g. nginx, docker, postgresql"
              value={newSvc}
              onChange={(e) => setNewSvc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCatalog()}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={addCatalog}>
              <IconPlus size={12} /> Add
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {catalog.map((c) => (
              <span key={c.id} className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {c.name}
                <button type="button" onClick={() => delCatalog(c.id, c.name)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--red)' }}>
                  <IconTrash size={11} />
                </button>
              </span>
            ))}
            {catalog.length === 0 && <span className="muted">No critical services configured.</span>}
          </div>
        </div>
      )}

      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header"><span className="text-blue"><IconShield size={16} /></span><span>Systems</span></div>
          <div className="top-stat-value">{totals.hosts}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span style={{ color: 'var(--green)' }}><IconCheckCircle size={16} /></span><span>Services Monitored</span></div>
          <div className="top-stat-value">{totals.services}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span style={{ color: 'var(--red)' }}><IconXCircle size={16} /></span><span>Critical Failed</span></div>
          <div className="top-stat-value" style={{ color: totals.critical_failed ? 'var(--red)' : 'var(--green)' }}>{totals.critical_failed}</div>
        </div>
        <div className="top-stat-card">
          <div className="top-stat-header"><span style={{ color: 'var(--amber)' }}><IconAlertTriangle size={16} /></span><span>Disk &gt;90%</span></div>
          <div className="top-stat-value" style={{ color: totals.fs_over_threshold ? 'var(--amber)' : 'var(--green)' }}>{totals.fs_over_threshold}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>System</th><th>Critical Services</th><th>Disk (max)</th><th>Last Checked</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => {
                const open = expanded.has(h.id)
                const critColor = h.summary.critical_failed > 0 ? 'var(--red)' : h.summary.critical_total > 0 ? 'var(--green)' : 'var(--slate)'
                const diskColor = h.summary.fs_over_threshold > 0 ? 'var(--red)' : h.summary.fs_max_use >= 75 ? 'var(--amber)' : 'var(--green)'
                return (
                  <Fragment key={h.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggle(h.id)}>
                      <td className="muted">{open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{h.friendly_name || h.hostname}</div>
                        <div className="mono muted" style={{ fontSize: 11 }}>{h.hostname}{h.ip_address ? ` · ${h.ip_address}` : ''}</div>
                      </td>
                      <td>
                        <span style={{ color: critColor, fontWeight: 600 }}>
                          {h.summary.critical_total - h.summary.critical_failed}/{h.summary.critical_total} healthy
                        </span>
                        {h.summary.critical_failed > 0 && (
                          <span className="badge badge-red" style={{ marginLeft: 6 }}>{h.summary.critical_failed} failed</span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: diskColor, fontWeight: 600 }}>{h.summary.fs_max_use}%</span>
                        <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                          {h.summary.fs_total} mounts{h.summary.fs_over_threshold > 0 ? ` · ${h.summary.fs_over_threshold} >90%` : ''}
                        </span>
                      </td>
                      <td className="muted" style={{ fontSize: 11 }}>
                        {h.summary.last_checked ? new Date(h.summary.last_checked).toLocaleString() : 'never'}
                      </td>
                      {isAdmin && (
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-sm" onClick={() => refreshHost(h.id)} disabled={busy === h.id} title="Refresh this host">
                            <IconRefresh size={12} /> {busy === h.id ? '…' : 'Refresh'}
                          </button>
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr key={`${h.id}-detail`} style={{ background: 'rgba(255,255,255,0.02)' }}>                        <td colSpan={isAdmin ? 6 : 5} style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <div>
                              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Services</h4>
                              {h.services.length === 0 && <span className="muted">No service data — run Refresh to collect.</span>}
                              {h.services.map((s) => (
                                <div key={s.service_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="mono" style={{ fontSize: 12, color: '#e2e8f0' }}>{s.service_name}</span>
                                    {s.is_critical && <span className="badge badge-blue" style={{ fontSize: 9, padding: '1px 5px' }}>critical</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ServiceBadge svc={s} />
                                    {isAdmin && s.is_critical && (
                                      <button type="button" className="btn btn-sm" onClick={() => restart(h.id, s.service_name)} title={`Restart ${s.service_name}`}>
                                        <IconRestart size={12} /> Restart
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div>
                              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filesystems</h4>
                              {h.filesystems.length === 0 && <span className="muted">No filesystem data — run Refresh to collect.</span>}
                              {h.filesystems.map((fs) => <FsBar key={fs.mount} fs={fs} />)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {hosts.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 24 }}>No hosts yet. Add hosts and run Refresh to collect service and disk status.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
