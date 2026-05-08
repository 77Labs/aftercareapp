import { useState } from 'react'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function RecoveryProgress({ day, total }) {
  const pct = Math.min(100, Math.round((day / total) * 100))
  return (
    <div className="recovery-progress">
      <div className="recovery-header">
        <span className="recovery-label">Recovery Progress</span>
        <span className="recovery-day">Day {day} of {total}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="recovery-pct">{pct}% complete</div>
    </div>
  )
}

function LogItem({ entry }) {
  const [expanded, setExpanded] = useState(false)

  if (entry.type === 'reminder_sent') {
    return (
      <li className="log-item">
        <span className="log-icon">📤</span>
        <div>
          <div className="log-label">Reminder sent — Day {entry.day}</div>
          <div className="log-meta">{formatDate(entry.sentAt)}</div>
        </div>
      </li>
    )
  }

  if (entry.type === 'photo_uploaded') {
    return (
      <li className="log-item log-item--photo">
        <span className="log-icon">📷</span>
        <div style={{ flex: 1 }}>
          <div className="log-label">Photo uploaded — Day {entry.day} · sent to doctor</div>
          <div className="log-meta">{formatDate(entry.uploadedAt)}</div>
          {entry.photoUrl && (
            <a href={entry.photoUrl} target="_blank" rel="noopener noreferrer" className="photo-thumb-link">
              <img src={entry.photoUrl} alt={`Day ${entry.day}`} className="photo-thumb" />
            </a>
          )}
          {entry.note && (
            <div className="log-note-wrap">
              <button
                type="button"
                className="log-note-toggle"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? 'Hide' : 'Show'} AI recovery note
              </button>
              {expanded && <p className="log-note">{entry.note}</p>}
            </div>
          )}
        </div>
      </li>
    )
  }

  if (entry.type === 'sms_photo_received') {
    return (
      <li className="log-item">
        <span className="log-icon">💬</span>
        <div>
          <div className="log-label">SMS photo received — forwarded to doctor</div>
          <div className="log-meta">{formatDate(entry.receivedAt)} · from {entry.from}</div>
          {entry.body && <div className="log-body">"{entry.body}"</div>}
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
        <p>Go to Setup to add a procedure and configure reminders.</p>
      </div>
    )
  }

  const day = (() => {
    const start = new Date(config.procedureDate)
    start.setHours(0, 0, 0, 0)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.max(1, Math.floor((now - start) / 86400000) + 1)
  })()

  const uploadUrl = `${window.location.origin}/upload?t=${config.uploadToken}`

  async function sendNow() {
    setSending(true)
    setMsg(null)
    try {
      const res = await fetch('/api/send-reminder', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'success', text: 'Reminder sent!' })
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
        <div className="dashboard-top">
          <div>
            <h2 className="dashboard-title">{config.procedureName}</h2>
            {config.patientName && <div className="dashboard-patient">{config.patientName}</div>}
            <span className={`badge ${config.active ? 'badge-active' : 'badge-paused'}`}>
              {config.active ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>

        <RecoveryProgress day={day} total={config.recoveryDays} />

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
            <div className="summary-item-value">{config.reminderTimes?.join(' & ')} daily</div>
          </div>
          <div className="summary-item">
            <div className="summary-item-label">Procedure Date</div>
            <div className="summary-item-value">
              {new Date(config.procedureDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>

        <div className="upload-link-box">
          <span className="upload-link-label">Patient Photo Upload Link</span>
          <div className="upload-link-row">
            <input readOnly value={uploadUrl} className="upload-link-input" onClick={e => e.target.select()} />
            <button
              type="button"
              className="btn-outline"
              onClick={() => { navigator.clipboard.writeText(uploadUrl); setMsg({ type: 'success', text: 'Link copied!' }) }}
            >
              Copy
            </button>
          </div>
        </div>

        <details>
          <summary className="instructions-toggle">View Instructions</summary>
          <pre className="instructions-pre">{config.instructions}</pre>
        </details>

        <div className="dashboard-actions" style={{ marginTop: '1.25rem' }}>
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
          <a
            href="/api/calendar.ics"
            download
            className="btn-outline"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            Download Calendar
          </a>
        </div>

        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
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
