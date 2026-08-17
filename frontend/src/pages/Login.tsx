import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import {
  IconPatchMonLogo,
  IconDiscord,
  IconStar,
  IconLinkedIn,
  IconYouTube,
  IconTrash,
  IconLink,
  IconBug,
  IconBook,
  IconGlobe,
  IconUser,
  IconLock,
  IconEye,
  IconEyeOff,
  IconExternalLink,
} from '../components/Icons'

export default function Login() {
  const { setUser } = useAuth()
  const [username, setUsername] = useState('test')
  const [password, setPassword] = useState('Bogdan123!')
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
        {/* Left Column: Brand, Version info, Social pills */}
        <div className="login-brand-col">
          <div>
            <div className="login-brand-header">
              <IconPatchMonLogo size={42} />
              <span className="login-brand-text">PatchMon</span>
            </div>
            <div className="login-tagline">Linux Patch Management</div>
          </div>

          {/* Release card */}
          <div className="version-release-card">
            <div className="version-badge-green">
              <span style={{ fontSize: 16 }}>●</span> You're on Latest <strong>v2.1.3</strong>
            </div>
            <h3 className="version-title">Version 2.1.3</h3>
            <div className="version-date">
              <span>📅</span> Released August 16, 2026
            </div>
            <p className="version-desc">
              A bug-fix release: single sign-on with ADFS, Mattermost and Rocket.Chat webhooks, compliance content on installs outside the official Docker image, and laptops that showed as stale after waking.
            </p>
            <a href="https://github.com/Sor4nn/Server_Patching_Tool/releases" target="_blank" rel="noreferrer" className="version-link">
              View Release Notes <IconExternalLink size={13} />
            </a>
          </div>

          {/* Connect section */}
          <div>
            <div className="connect-section-title">Connect with us</div>
            <div className="social-pills-row">
              <a href="https://discord.com" target="_blank" rel="noreferrer" className="social-pill discord-pill">
                <IconDiscord size={14} />
                <span className="social-count">811</span>
              </a>

              <a href="https://github.com/Sor4nn/Server_Patching_Tool" target="_blank" rel="noreferrer" className="social-pill github-pill">
                <IconStar size={13} className="star-icon" />
                <span className="social-count">3.2k</span>
              </a>

              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="social-pill linkedin-pill">
                <IconLinkedIn size={13} />
                <span className="social-count">803</span>
              </a>

              <a href="https://youtube.com" target="_blank" rel="noreferrer" className="social-pill youtube-pill">
                <IconYouTube size={14} />
                <span className="social-count">194</span>
              </a>

              <button type="button" className="social-pill" title="Clean Cache">
                <IconTrash size={14} />
              </button>

              <button type="button" className="social-pill" title="API">
                <IconLink size={14} />
              </button>

              <button type="button" className="social-pill" title="Report Bug">
                <IconBug size={14} />
              </button>

              <button type="button" className="social-pill" title="Documentation">
                <IconBook size={14} />
              </button>

              <button type="button" className="social-pill" title="Website">
                <IconGlobe size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: White Sign In Card */}
        <div className="white-login-card">
          <div className="white-card-logo">
            <IconPatchMonLogo size={52} />
          </div>
          <h2 className="white-card-title">Sign in to PatchMon</h2>
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
