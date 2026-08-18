import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import {
  IconShield,
  IconUser,
  IconLock,
  IconEye,
  IconEyeOff,
} from '../components/Icons'

export default function Login() {
  const { setUser } = useAuth()
  const [username, setUsername] = useState('test')
  const [password, setPassword] = useState('test')
  const [showPassword, setShowPassword] = useState(false)
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
      setError(err instanceof Error ? err.message : 'Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page-container">
      <div className="login-content-split">
        {/* Left Column: Brand, Version info */}
        <div className="login-brand-col">
          <div>
            <div className="login-brand-header">
              <IconShield size={42} />
              <span className="login-brand-text">GPTA</span>
            </div>
            <div className="login-tagline">Server Patch Management</div>
          </div>

          {/* Version card */}
          <div className="version-release-card">
            <div className="version-badge-green">
              <span style={{ fontSize: 16 }}>●</span> You're on the latest <strong>v1.00</strong>
            </div>
            <h3 className="version-title">Version 1.00</h3>
            <p className="version-desc">
              Fresh start for server patch management: host inventory, package
              tracking and history, security reporting, and automated patching
              runs in one dashboard.
            </p>
          </div>
        </div>

        {/* Right Column: White Sign In Card */}
        <div className="white-login-card">
          <div className="white-card-logo">
            <IconShield size={52} />
          </div>
          <h2 className="white-card-title">Sign in to GPTA</h2>
          <p className="white-card-sub">Monitor and manage your Linux package updates</p>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={submit}>
            <div className="white-card-input-wrapper">
              <label className="white-card-label">Username or Email</label>
              <div style={{ position: 'relative' }}>
                <IconUser size={16} className="white-input-icon" />
                <input
                  type="text"
                  required
                  className="white-input-field"
                  placeholder="Enter your username or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="white-card-input-wrapper">
              <label className="white-card-label">Password</label>
              <div style={{ position: 'relative' }}>
                <IconLock size={16} className="white-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="white-input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="white-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="white-login-btn"
              disabled={busy}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}