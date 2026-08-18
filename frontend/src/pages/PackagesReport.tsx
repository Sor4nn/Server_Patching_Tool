import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { UniquePackagesReport } from '../types'
import { IconChevronLeft, IconPackage, IconRefresh } from '../components/Icons'
import SearchSelect from '../components/SearchSelect'

export default function PackagesReport() {
  const [report, setReport] = useState<UniquePackagesReport | null>(null)
  const [serverId, setServerId] = useState<number | null>(null)
  const [pkgName, setPkgName] = useState<string | null>(null)
  const [osName, setOsName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setReport(null)
    api.uniquePackagesReport()
      .then(setReport)
      .catch(() => setReport({ success: false, generated_at: '', groups: [], total: 0 }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const hostMeta = useMemo(() => {
    const map = new Map<number, { name: string; os: string; fleet: number }>()
    for (const g of report?.groups ?? []) {
      for (const p of g.packages) {
        if (!map.has(p.host.id)) {
          map.set(p.host.id, {
            name: p.host.friendly_name || p.host.hostname,
            os: `${g.os_make} ${g.os_version}`,
            fleet: g.hosts,
          })
        }
      }
    }
    return map
  }, [report])

  const serverItems = useMemo(
    () => [...hostMeta.entries()].map(([value, m]) => ({ value, label: m.name })),
    [hostMeta],
  )

  const packageItems = useMemo(() => {
    const names = new Set<string>()
    for (const g of report?.groups ?? []) for (const p of g.packages) names.add(p.name)
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [report])

  const osItems = useMemo(() => {
    const oses = new Set<string>()
    for (const g of report?.groups ?? []) oses.add(`${g.os_make} ${g.os_version}`)
    return [...oses].sort().map((os) => ({ value: os, label: os }))
  }, [report])

  const allRows = report ? report.groups.flatMap((g) => g.packages) : []

  const hasFilter = serverId !== null || pkgName !== null || osName !== null
  const filtered = hasFilter
    ? allRows.filter((p) => {
        if (serverId !== null && p.host.id !== serverId) return false
        if (pkgName !== null && p.name !== pkgName) return false
        if (osName !== null && hostMeta.get(p.host.id)?.os !== osName) return false
        return true
      })
    : allRows

  const singleMeta = serverId !== null ? hostMeta.get(serverId) ?? null : null

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
            <Link to="/packages" className="btn btn-sm" title="Back to Packages">
              <IconChevronLeft size={14} /> Packages
            </Link>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>Unique Package Report</h1>
              <p className="page-sub">
                Packages installed on exactly one host of an OS fleet; re-occuring packages are excluded.
              </p>
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={load} title="Refresh">
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {/* Filter form */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="flex flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="flex" style={{ gap: 10, flexWrap: 'wrap' }}>
            <SearchSelect
              items={serverItems}
              selected={serverId}
              onSelect={setServerId}
              placeholder="Server — type to search…"
              allLabel="All servers"
              width={230}
            />
            <SearchSelect
              items={packageItems}
              selected={pkgName}
              onSelect={setPkgName}
              placeholder="Package — type to search…"
              allLabel="All packages"
              width={230}
            />
            <SearchSelect
              items={osItems}
              selected={osName}
              onSelect={setOsName}
              placeholder="OS — type to search…"
              allLabel="All OS"
              width={230}
            />
          </div>

          {singleMeta ? (
            <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
              <span className="badge badge-blue">Server: {singleMeta.name}</span>
              <span className="badge badge-blue">{singleMeta.os}</span>
              <span className="badge badge-blue">{singleMeta.fleet} hosts in fleet</span>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              {report ? `${filtered.length} unique package${filtered.length === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ margin: 0 }}>
            <thead>
              <tr style={{ background: '#0a0f1c' }}>
                <th>Package</th>
                <th>Version</th>
                <th>Server</th>
                <th>OS Fleet</th>
                <th>Status</th>
                <th>CVE</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">
                    Loading report…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32 }} className="muted">
                    {hasFilter
                      ? 'No unique packages match the selected filters.'
                      : 'No unique packages found. Every package re-occurs across the hosts of its OS fleet.'}
                  </td>
                </tr>
              ) : filtered.map((p) => {
                  const cves = p.cves ? p.cves.split(',').map((c) => c.trim()).filter(Boolean) : []
                  const meta = hostMeta.get(p.host.id)
                  return (
                    <tr key={`${meta?.os}-${p.name}`}>
                      <td>
                        <span className="flex" style={{ gap: 7 }}>
                          <IconPackage size={15} className="muted" />
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name}</span>
                        </span>
                      </td>
                      <td className="mono muted">{p.version}</td>
                      <td>
                        <Link to={`/hosts/${p.host.id}`} style={{ color: '#60a5fa' }}>
                          {p.host.friendly_name || p.host.hostname}
                        </Link>
                      </td>
                      <td className="muted">{meta?.os}</td>
                      <td>
                        {p.is_security_update && p.needs_update ? (
                          <span className="badge badge-red">Security</span>
                        ) : p.needs_update ? (
                          <span className="badge badge-amber">Update Available</span>
                        ) : (
                          <span className="badge badge-green">Up to Date</span>
                        )}
                      </td>
                      <td>
                        {cves.length > 0 ? (
                          <div className="flex" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {cves.slice(0, 4).map((c) => (
                              <span key={c} className="badge badge-red" style={{ fontSize: 10.5 }}>{c}</span>
                            ))}
                            {cves.length > 4 && <span className="muted">+{cves.length - 4}</span>}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}