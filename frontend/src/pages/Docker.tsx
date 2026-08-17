import { IconDocker, IconRefresh } from '../components/Icons'

export default function Docker() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex" style={{ gap: 8 }}>
            <h1 className="page-title">Docker Management</h1>
            <span className="nav-badge-pill nav-badge-beta" style={{ padding: '3px 8px', fontSize: 11 }}>Beta</span>
          </div>
          <p className="page-sub">Monitor containerized services, container image updates, and Docker host daemons</p>
        </div>
        <button type="button" className="btn btn-sm">
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      <div className="top-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 18 }}>
        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconDocker size={16} /></span>
            <span>Docker Hosts</span>
          </div>
          <div className="top-stat-value">1</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--green)' }}><IconDocker size={16} /></span>
            <span>Running Containers</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--green)' }}>3</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span className="text-blue"><IconDocker size={16} /></span>
            <span>Images Stored</span>
          </div>
          <div className="top-stat-value">6</div>
        </div>

        <div className="top-stat-card">
          <div className="top-stat-header">
            <span style={{ color: 'var(--amber)' }}><IconDocker size={16} /></span>
            <span>Image Updates</span>
          </div>
          <div className="top-stat-value" style={{ color: 'var(--amber)' }}>0</div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Active Containers</h3>
        <table style={{ margin: 0 }}>
          <thead>
            <tr><th>CONTAINER</th><th>IMAGE</th><th>STATUS</th><th>PORTS</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, color: '#f1f5f9' }}>patchmon-server</td>
              <td className="mono muted">patchmon/server:v2.1.3</td>
              <td><span className="badge badge-green">Up 47 minutes</span></td>
              <td className="mono muted">0.0.0.0:3000-&gt;3000/tcp</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#f1f5f9' }}>patchmon-db</td>
              <td className="mono muted">sqlite:embedded</td>
              <td><span className="badge badge-green">Up 47 minutes</span></td>
              <td className="mono muted">-</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#f1f5f9' }}>patchmon-agent-runner</td>
              <td className="mono muted">ansible/awx-runner:latest</td>
              <td><span className="badge badge-green">Up 47 minutes</span></td>
              <td className="mono muted">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
