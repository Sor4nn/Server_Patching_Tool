import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Host, PackageDiff, PackageDiffItem, PackageSnapshot } from '../types'
import { IconRefresh } from '../components/Icons'
import SearchSelect from '../components/SearchSelect'

function fmt(iso: string) {
  return new Date(iso).toLocaleString()
}

function kindBadge(kind: string) {
  return kind === 'baseline'
    ? <span className="badge badge-blue">Baseline</span>
    : <span className="badge badge-gray">Report</span>
}

function DiffTable({ title, items, tone }: { title: string; items: PackageDiffItem[]; tone: 'add' | 'del' | 'chg' }) {
  return (
    <div className="card mt">
      <div className="flex flex-between mb">
        <h3 className="card-title" style={{ margin: 0 }}>{title} ({items.length})</h3>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>PACKAGE</th><th>FROM</th><th>TO</th><th>SECURITY</th><th>CVEs</th></tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.name}>
                <td>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {tone === 'add' && <span style={{ color: 'var(--green)' }}>+ </span>}
                    {tone === 'del' && <span style={{ color: 'var(--red)' }}>− </span>}
                    {it.name}
                  </span>
                </td>
                <td className="mono muted">{it.from ?? it.version ?? ''}</td>
                <td className="mono">
                  {it.to && <span style={{ color: tone === 'chg' ? 'var(--amber)' : undefined }}>{it.to}</span>}
                </td>
                <td>
                  {it.to_security || it.is_security_update
                    ? <span className="badge badge-red">Security</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="mono muted" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.cves || ''}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>None</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PackageHistory() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [hostId, setHostId] = useState<number | null>(null)
  const [snapshots, setSnapshots] = useState<PackageSnapshot[]>([])
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [diff, setDiff] = useState<PackageDiff | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadHosts = useCallback(async () => {
    try {
      const h = await api.listHosts()
      setHosts(h.hosts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hosts')
    }
  }, [])

  useEffect(() => { loadHosts() }, [loadHosts])

  const loadHistory = useCallback(async (hid: number | null) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.packageHistory(hid)
      setSnapshots(res.snapshots)
      setFromId(res.snapshots.length > 1 ? String(res.snapshots[1].snapshot_id) : '')
      setToId(res.snapshots.length > 0 ? String(res.snapshots[0].snapshot_id) : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory(hostId) }, [hostId, loadHistory])

  useEffect(() => {
    const a = Number(fromId)
    const b = Number(toId)
    if (!a || !b || a === b) {
      setDiff(null)
      return
    }
    api.packageDiff(a, b)
      .then(setDiff)
      .catch((e) => setError(e instanceof Error ? e.message : 'Diff failed'))
  }, [fromId, toId])

  const selectedHostName = useMemo(() => {
    if (!hostId) return 'All hosts'
    const h = hosts.find((x) => x.id === hostId)
    return h ? (h.friendly_name || h.hostname) : 'Host'
  }, [hostId, hosts])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Package History</h1>
          <p className="page-sub">Versioned history of installed packages — pick two snapshots to diff, like git</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => loadHistory(hostId)} title="Reload">
          <IconRefresh size={14} />
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="flex" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchSelect
          items={hosts.map((h) => ({
            value: h.id,
            label: h.friendly_name || h.hostname,
            hint: h.friendly_name && h.hostname !== h.friendly_name ? h.hostname : undefined,
          }))}
          selected={hostId}
          onSelect={setHostId}
          placeholder="All hosts — type to search…"
          allLabel="All hosts"
          width={260}
        />
        <span className="muted" style={{ alignSelf: 'center' }}>Compare</span>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Select (older)…</option>
          {snapshots.filter((s) => s.snapshot_id !== Number(toId)).map((s) => (
            <option key={s.snapshot_id} value={s.snapshot_id}>{fmt(s.captured_at)} · {s.kind} · +{s.changes} changes</option>
          ))}
        </select>
        <span className="muted" style={{ alignSelf: 'center' }}>→</span>
        <select value={toId} onChange={(e) => setToId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Select (newer)…</option>
          {snapshots.filter((s) => s.snapshot_id !== Number(fromId)).map((s) => (
            <option key={s.snapshot_id} value={s.snapshot_id}>{fmt(s.captured_at)} · {s.kind} · +{s.changes} changes</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>Loading history…</p>
        ) : snapshots.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>No snapshots recorded yet. Snapshots are captured automatically whenever a package state changes on a reporting host.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>HOST</th><th>CAPTURED AT</th><th>KIND</th><th>PACKAGES</th><th>CHANGES</th></tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => (
                  <tr
                    key={s.snapshot_id}
                    style={{ cursor: 'pointer', background: s.snapshot_id === Number(fromId) ? 'rgba(59,130,246,0.12)' : s.snapshot_id === Number(toId) ? 'rgba(34,197,94,0.10)' : undefined }}
                    onClick={() => {
                      if (fromId === String(s.snapshot_id)) setFromId('')
                      else if (toId === String(s.snapshot_id)) setToId('')
                      else if (!fromId || (fromId && !toId)) setFromId(String(s.snapshot_id))
                      else setToId(String(s.snapshot_id))
                    }}
                  >
                    <td className="muted">{snapshots.length - i}</td>
                    <td>{hostId ? selectedHostName : (s.friendly_name || s.hostname)}</td>
                    <td className="mono">{fmt(s.captured_at)}</td>
                    <td>{kindBadge(s.kind)}</td>
                    <td>{s.package_count}</td>
                    <td style={{ color: s.changes > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>{s.changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {diff && (
        <>
          <div className="top-stats-row" style={{ marginTop: 16 }}>
            <div className="top-stat-card">
              <div className="top-stat-header"><span>Diff Window</span></div>
              <div className="top-stat-value" style={{ fontSize: 13 }}>{fmt(diff.from.captured_at)} → {fmt(diff.to.captured_at)}</div>
            </div>
            <div className="top-stat-card">
              <div className="top-stat-header"><span>Changed</span></div>
              <div className="top-stat-value" style={{ color: 'var(--amber)' }}>{diff.summary.changed}</div>
            </div>
            <div className="top-stat-card">
              <div className="top-stat-header"><span>Added</span></div>
              <div className="top-stat-value" style={{ color: 'var(--green)' }}>{diff.summary.added}</div>
            </div>
            <div className="top-stat-card">
              <div className="top-stat-header"><span>Removed</span></div>
              <div className="top-stat-value" style={{ color: 'var(--red)' }}>{diff.summary.removed}</div>
            </div>
            <div className="top-stat-card">
              <div className="top-stat-header"><span>Security Open</span></div>
              <div className="top-stat-value" style={{ color: 'var(--red)' }}>{diff.summary.security_to}</div>
            </div>
          </div>

          <DiffTable title="Changed packages" items={diff.changed} tone="chg" />
          <DiffTable title="Added packages" items={diff.added} tone="add" />
          <DiffTable title="Removed packages" items={diff.removed} tone="del" />
        </>
      )}
    </div>
  )
}