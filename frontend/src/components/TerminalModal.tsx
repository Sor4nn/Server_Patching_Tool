import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'
import type { Credential } from '../types'
import { IconTerminal } from './Icons'

type Protocol = 'ssh' | 'powershell'

interface Props {
  hostId: number
  hostLabel: string
  onClose: () => void
}

export default function TerminalModal({ hostId, hostLabel, onClose }: Props) {
  const [protocol, setProtocol] = useState<Protocol>('ssh')
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [credentialId, setCredentialId] = useState<number | ''>('')
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('')
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const protocolRef = useRef<Protocol>('ssh')

  protocolRef.current = protocol

  useEffect(() => {
    api.listCredentials().then((res) => {
      setCredentials(res.credentials)
      const ssh = res.credentials.find((c) => c.credential_type !== null)
      if (!credentialId && ssh) setCredentialId(ssh.id)
    }).catch(() => setStatus('Failed to load credentials'))
    return () => disconnect()
  }, [])

  useEffect(() => {
    if (!connected || !termRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
      theme: { background: '#06070f', foreground: '#dbe4f0', cursor: '#60a5fa' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit

    const sendData = (data: string) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }))
      }
    }
    const resize = () => {
      try {
        fit.fit()
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch {
        /* ignore */
      }
    }
    term.onData(sendData)
    const ro = new ResizeObserver(resize)
    if (termRef.current) ro.observe(termRef.current)
    resize()

    return () => {
      ro.disconnect()
      sendData('\u0003') // Ctrl+C
      try { fit.dispose() } catch { /* ignore */ }
      try { term.dispose() } catch { /* ignore */ }
      xtermRef.current = null
    }
  }, [connected])

  async function connect() {
    setStatus('Connecting…')
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/terminal/${hostId}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      setStatus('')
      const t = xtermRef.current
      const cols = t?.cols ?? 80
      const rows = t?.rows ?? 24
      ws.send(JSON.stringify({
        protocol: protocolRef.current,
        credential_id: credentialId || undefined,
        cols,
        rows,
      }))
    }
    const flush = (data: string | ArrayBuffer) => {
      const term = xtermRef.current
      if (!term) return
      if (data instanceof ArrayBuffer) {
        term.write(new Uint8Array(data))
      } else {
        term.write(data)
      }
    }
    ws.onmessage = (e) => {
      flush(typeof e.data === 'string' ? e.data : e.data as ArrayBuffer)
    }
    ws.onerror = () => {
      setConnected(false)
      setStatus('Connection failed')
    }
    ws.onclose = () => {
      setConnected(false)
      setStatus((s) => (s || '').startsWith('Connection') ? s : 'Disconnected')
    }
  }

  function disconnect() {
    const ws = wsRef.current
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    wsRef.current = null
    setConnected(false)
    setStatus('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-terminal" onClick={(e) => e.stopPropagation()}>
        <div className="terminal-toolbar">
          <div className="protocol-picker">
            <button type="button" className={`protocol-pill ${protocol === 'ssh' ? 'active' : ''}`}
              onClick={() => setProtocol('ssh')}>SSH</button>
            <button type="button" className="protocol-pill" disabled title="PowerShell support coming soon">
              PowerShell
            </button>
          </div>
          <button type="button" className="btn btn-sm" onClick={connected ? disconnect : onClose}>
            <IconTerminal size={14} /> {connected ? 'Disconnect' : 'Close'}
          </button>
        </div>

        <h3 className="page-title" style={{ marginBottom: 4 }}>Terminal</h3>
        <p className="page-sub mono" style={{ marginBottom: 14 }}>{hostLabel}</p>

        {!connected && (
          <>
            <label className="form-label">Credential (username/SSH key)</label>
            <select
              className="form-input"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">No credential (uses default)</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.username || c.credential_type}</option>
              ))}
            </select>
            {status && <div className="login-error" style={{ marginBottom: 10 }}>{status}</div>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={connect}>
                <IconTerminal size={14} /> Connect
              </button>
            </div>
          </>
        )}

        {connected && (
          <>
            {status && <div className="login-error" style={{ marginBottom: 10 }}>{status}</div>}
            <div className="terminal-box" ref={termRef} />
          </>
        )}
      </div>
    </div>
  )
}