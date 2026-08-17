import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { PackageAggregate } from '../types'
import { IconPackage, IconSearch } from '../components/Icons'

function toneFor(p: PackageAggregate) {
  if (p.stats.securityUpdates > 0) return 'badge-red'
  if (p.stats.updatesNeeded > 0) return 'badge-amber'
  return 'badge-green'
}

export default function Packages() {
  const [packages, setPackages] = useState<PackageAggregate[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (search) params.set('search', search)
    const q = params.toString() ? `?${params.toString()}` : ''
    const [res, cat] = await Promise.all([
      api.listPackages(q).catch(() => ({ success: false, packages: [], total: 0, categories: [] })),
      api.packageCategories().catch(() => ({ success: false, categories: [] })),
    ])
    setPackages(res.packages || [])
    setCategories(cat.categories || [])
  }, [category, search])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => packages.reduce(
    (acc, p) => ({
      total: acc.total + p.stats.totalInstalls,
      updates: acc.updates + p.stats.updatesNeeded,
      security: acc.security + p.stats.securityUpdates,
    }),
    { total: 0, updates: 0, security: 0 },
  ), [packages])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Packages</h1>
          <p className="page-sub">Installed packages, vulnerabilities, and available versions across all hosts</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={load}>Refresh</button>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Total Installs</div>
            <span className="text-blue"><IconPackage size={18} /></span>
          </div>
          <div className="stat-value blue">{totals.total}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Updates Needed</div>
            <span style={{ color: 'var(--amber)' }}><IconPackage size={18} /></span>
          </div>
          <div className="stat-value amber">{totals.updates}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Security Updates</div>
            <span style={{ color: 'var(--red)' }}><IconPackage size={18} /></span>
          </div>
          <div className="stat-value red">{totals.security}</div>
        </div>

        <div className="card stat-card">
          <div className="flex flex-between">
            <div className="stat-label">Unique Packages</div>
            <span style={{ color: 'var(--green)' }}><IconPackage size={18} /></span>
          </div>
          <div className="stat-value">{packages.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-between mb" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex" style={{ gap: 12 }}>
            <select
              style={{ width: 200 }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="top-search-bar" style={{ width: 280 }}>
              <IconSearch className="top-search-icon" size={15} />
              <input
                className="top-search-input"
                placeholder="Search package name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {packages.length === 0 ? (
          <p className="muted">No package data found. Run the <span className="mono">collect_packages</span> playbook on hosts.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Category</th>
                  <th>Latest</th>
                  <th>Installs</th>
                  <th>Updates</th>
                  <th>Security</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <Fragment key={p.id}>
                    <tr onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className={`badge ${toneFor(p)}`} style={{ marginRight: 8 }}>{expanded === p.id ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name}</span>
                      </td>
                      <td>{p.category || '—'}</td>
                      <td className="mono muted">{p.latest_version || '—'}</td>
                      <td>{p.stats.totalInstalls}</td>
                      <td>{p.stats.updatesNeeded > 0 ? <span className="badge badge-amber">{p.stats.updatesNeeded}</span> : 0}</td>
                      <td>{p.stats.securityUpdates > 0 ? <span className="badge badge-red">{p.stats.securityUpdates}</span> : 0}</td>
                    </tr>
                    {expanded === p.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg-input)', padding: 0 }}>
                          <div style={{ padding: '16px 20px' }}>
                            <table style={{ margin: 0, background: 'var(--bg-card)' }}>
                              <thead>
                                <tr><th>Host</th><th>OS</th><th>Installed</th><th>Available</th><th>Status</th></tr>
                              </thead>
                              <tbody>
                                {p.packageHosts.map((h) => (
                                  <tr key={h.hostId}>
                                    <td style={{ color: '#60a5fa', fontWeight: 600 }}>{h.friendlyName}</td>
                                    <td className="muted">{h.osType || '—'}</td>
                                    <td className="mono">{h.currentVersion}</td>
                                    <td className="mono" style={{ color: '#fbbf24' }}>{h.availableVersion || '—'}</td>
                                    <td>
                                      {h.isSecurityUpdate
                                        ? <span className="badge badge-red">Security</span>
                                        : h.needsUpdate
                                          ? <span className="badge badge-amber">Update Available</span>
                                          : <span className="badge badge-green">Current</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
    </div>
  )
}
