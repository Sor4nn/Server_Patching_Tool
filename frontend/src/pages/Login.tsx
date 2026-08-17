import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import { IconLogo } from '../components/Icons'

export default function Login() {
  const { setUser } = useAuth()
  const [username, setUsername] = useState('test')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login(username, password)
      setUser(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="card login-card">
        <div className="login-brand">
          <IconLogo size={36} />
          <div>
            <div className="brand-name" style={{ fontSize: 22 }}>PatchMon</div>
            <div className="brand-sub" style={{ color: 'var(--text-dim)', fontSize: 12 }}>Enterprise Server Patching & Compliance</div>
          </div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 20 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
