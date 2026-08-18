import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { PackageAggregate, Host } from '../types'
import {
  IconPackage,
  IconSearch,
  IconRefresh,
} from '../components/Icons'

export default function Packages() {
  const navigate = useNavigate()
  const [packages, setPackages] = useState<PackageAggregate[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [hostId, setHostId] = useState('')
  const [selectedPackages, setSelectedPackages] = useState<number[]>([])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (hostId) params.set('host_id', hostId)
    const q = params.toString() ? `?${params.toString()}` : ''
    const [res, cat] = await Promise.all([
      api.listPackages(q).catch(() => ({ success: false, packages: [], total: 0, categories: [] })),
      api.packageCategories().catch(() => ({ success: false, categories: [] })),
    ])
    setPackages(res.packages || [])
    setCategories(cat.categories || [])
  }, [category, search, status, hostId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.listHosts().then((r) => setHosts(r.hosts || [])).catch(() => {})
  }, [])

  const totals = useMemo(() => {
  const outdatedHosts = new Set<number>()
  for (const p of packages) {
    for (const h of p.packageHosts) {
      if (h.needsUpdate) outdatedHosts.add(h.hostId)
    }
  }
  const base = packages.reduce(
    (acc, p) => ({
      total: acc.total + p.stats.totalInstalls,
      updates: acc.updates + p.stats.updatesNeeded,
      security: acc.security + p.stats.securityUpdates,
    }),
    { total: 0, updates: 0, security: 0 },
  )
  return { ...base, outdatedHosts: outdatedHosts.size }
}, [packages])

  const toggleSelect = (id: number) => {
    setSelectedPackages((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedPackages.length === packages.length) setSelectedPackages([])
    else setSelectedPackages(packages.map((p) => p.id))
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Packages on all Hosts</h1>
          <p className="page-sub">Manage package updates and security patches</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={load} title="Refresh packages">
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {/* Top 5 Stat Cards */}
      <div className="top-stats-row" style={{ marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconPackage size={16} /></span>
            <span>Packages</span>
          </div>
          <div className="top-stat-value">{packages.length}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconPackage size={16} /></span>
            <span>Installations</span>
          </div>
          <div className="top-stat-value">{totals.total}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconPackage size={16} /></span>
            <span>Outdated Packages</span>
          </div>
          <div className="top-stat-value">{totals.updates}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--red)' }}><IconPackage size={16} /></span>
            <span>Security Packages</span>
          </div>
          <div className="top-stat-value">{totals.security}</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconPackage size={16} /></span>
            <span>Outdated Hosts</span>
          </div>
          <div className="top-stat-value">{totals.outdatedHosts}</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-between mb" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === 'dedicated') navigate('/packages/dedicated')
              e.target.value = ''
            }}
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
          >
            <option value="">View: All Packages</option>
            <option value="dedicated">Dedicated Report</option>
          </select>

          <div className="top-search-bar" style={{ width: 340 }}>
            <IconSearch className="top-search-icon" size={15} />
            <input
              className="top-search-input"
              placeholder="Search packages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex" style={{ gap: 8 }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
          >
            <option value="">All Packages</option>
            <option value="uptodate">Up to Date</option>
            <option value="outdated">Needs Update</option>
            <option value="security">Security Updates</option>
          </select>

          <select
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
          >
            <option value="">All Hosts</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>{h.hostname}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Packages Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: '#0a0f1c' }}>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', cursor: 'pointer' }}
                    checked={packages.length > 0 && selectedPackages.length === packages.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Package ⇅</th>
                <th>Installed On ⇅</th>
                <th>Status ⇅</th>
                <th>Latest Version ⇅</th>
                <th>CVE</th>
                <th>SOURCE REPOS</th>
              </tr>
            </thead>
            <tbody>
              {packages.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32 }} className="muted">
                    No packages found. Connect a host and collect package data.
                  </td>
                </tr>
              )}
              {packages.map((p) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto', cursor: 'pointer' }}
                      checked={selectedPackages.includes(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td>
                    <span className="flex" style={{ gap: 7 }}>
                      <IconPackage size={15} className="muted" />
                      <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name}</span>
                    </span>
                  </td>
                  <td className="muted">{p.packageHostsCount} host{p.packageHostsCount === 1 ? '' : 's'}</td>
                  <td>
                    {p.stats?.updatesNeeded > 0 ? (
                      <span className="badge badge-amber">Update Available</span>
                    ) : (
                      <span className="badge badge-green">Up to Date</span>
                    )}
                  </td>
                  <td className="mono muted">{p.latest_version || 'N/A'}</td>
                  <td>
                    {(() => {
                      const cves = p.packageHosts.flatMap((h) => h.cves ? h.cves.split(',').map((c) => c.trim()) : [])
                      const unique = [...new Set(cves)].filter(Boolean)
                      return unique.length > 0 ? (
                        <div className="flex" style={{ gap: 4, flexWrap: 'wrap' }}>
                          {unique.slice(0, 4).map((c) => (
                            <span key={c} className="badge badge-red" style={{ fontSize: 10.5 }}>
                              {c}
                            </span>
                          ))}
                          {unique.length > 4 && <span className="muted">+{unique.length - 4}</span>}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )
                    })()}
                  </td>
                  <td>
                    {p.sourceRepos && p.sourceRepos.length > 0 ? (
                      p.sourceRepos.map((r, idx) => (
                        <span key={idx} className="badge badge-blue" style={{ fontSize: 10.5 }}>
                          {r.repoName}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex flex-between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: '#0a0f1c', fontSize: 12, color: 'var(--text-dim)' }}>
          <div className="flex" style={{ gap: 8 }}>
            <span>Rows per page:</span>
            <select style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }}>
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            <span>{packages.length} of {packages.length}</span>
          </div>

          <div className="flex" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm" disabled style={{ padding: '3px 8px' }}>‹</button>
            <span>Page 1</span>
            <button type="button" className="btn btn-sm" disabled style={{ padding: '3px 8px' }}>›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
