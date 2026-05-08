import { useState } from 'react'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function LogItem({ entry }) {
  if (entry.type === 'reminder_sent') {
    return (
      <li className="log-item">
        <span className="log-icon">📤</span>
        <div>
          <div className="log-label">Reminder sent to patient</div>
          <div className="log-meta">{formatDate(entry.sentAt)}</div>
        </div>
      </li>
    )
  }

  if (entry.type === 'photo_received') {
    return (
      <li className="log-item">
        <span className="log-icon">📷</span>
        <div>
          <div className="log-label">Photo received — forwarded to doctor</div>
          <div className="log-meta">
            {formatDate(entry.receivedAt)} &nbsp;·&nbsp; from {entry.from}
          </div>
          {entry.body && <div className="log-body">"{entry.body}"</div>}
          {entry.mediaUrl && (
            <a
              href={entry.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}
            >
              View photo
            </a>
          )}
        </div>
      </li>
    )
  }

  return null
}

export default function Dashboard({ config, onRefresh }) {
  const [sending, setSending] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [msg, setMsg] = useState(null)

  if (!config) {
    return (
      <div className="empty-state">
        <h2>No active plan</h2>
        <p>Go to Setup to upload aftercare instructions and configure reminders.</p>
      </div>
    )
  }

  async function sendNow() {
    setSending(true)
    setMsg(null)
    try {
      const res = await fetch('/api/send-reminder', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'success', text: 'Reminder sent successfully!' })
      onRefresh()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSending(false)
    }
  }

  async function toggleActive() {
    setToggling(true)
    setMsg(null)
    try {
      const res = await fetch('/api/toggle-active', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onRefresh()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setToggling(false)
    }
  }

  const log = config.reminderLog || []

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.2rem' }}>{config.procedureName}</h2>
            <span className={`badge ${config.active ? 'badge-active' : 'badge-paused'}`}>
              {config.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            Created {formatDate(config.createdAt)}
          </span>
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-item-label">Patient</div>
            <div className="summary-item-value">{config.patientPhone}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item-label">Doctor</div>
            <div className="summary-item-value">{config.doctorPhone}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item-label">Reminders</div>
            <div className="summary-item-value">
              {config.reminderTimes?.join(' & ')} <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>daily</span>
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-item-label">Timezone</div>
            <div className="summary-item-value" style={{ fontSize: '0.85rem' }}>{config.timezone}</div>
          </div>
        </div>

        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
            View Instructions
          </summary>
          <pre style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--color-text-secondary)',
            maxHeight: '220px',
            overflowY: 'auto',
          }}>
            {config.instructions}
          </pre>
        </details>

        <div className="dashboard-actions">
          <button className="btn-success" onClick={sendNow} disabled={sending}>
            {sending ? 'Sending…' : 'Send Reminder Now'}
          </button>
          <button
            className={config.active ? 'btn-outline' : 'btn-primary'}
            onClick={toggleActive}
            disabled={toggling}
          >
            {toggling ? '…' : config.active ? 'Pause Reminders' : 'Resume Reminders'}
          </button>
        </div>

        {msg && (
          <div className={`alert alert-${msg.type}`}>{msg.text}</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Activity Log</div>
        {log.length === 0 ? (
          <div className="log-empty">No activity yet. Send a reminder to get started.</div>
        ) : (
          <ul className="log-list">
            {log.map((entry, i) => <LogItem key={i} entry={entry} />)}
          </ul>
        )}
      </div>
    </div>
  )
}
