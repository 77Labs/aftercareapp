import { useState, useRef } from 'react'
import InstructionGenerator from './InstructionGenerator.jsx'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const INSTRUCTION_MODES = [
  { id: 'generate', label: 'AI Generate' },
  { id: 'paste', label: 'Paste / Type' },
  { id: 'upload', label: 'Upload File' },
]

function RecoveryPlanModal({ plan, onConfirm, onEdit, saving }) {
  const startDate = plan.procedureDate
    ? new Date(plan.procedureDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'
  const endDate = plan.procedureDate && plan.recoveryDays
    ? (() => {
        const d = new Date(plan.procedureDate + 'T00:00:00')
        d.setDate(d.getDate() + plan.recoveryDays - 1)
        return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      })()
    : '—'

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Recovery Plan</h2>
          <p className="modal-sub">Review and confirm before activating</p>
        </div>

        <div className="plan-rows">
          <div className="plan-row">
            <span className="plan-key">Procedure</span>
            <span className="plan-val">{plan.procedureName || '—'}</span>
          </div>
          {plan.patientName && (
            <div className="plan-row">
              <span className="plan-key">Patient</span>
              <span className="plan-val">{plan.patientName}</span>
            </div>
          )}
          <div className="plan-row">
            <span className="plan-key">Procedure Date</span>
            <span className="plan-val">{startDate}</span>
          </div>
          <div className="plan-row">
            <span className="plan-key">Recovery Period</span>
            <span className="plan-val">{plan.recoveryDays} days</span>
          </div>
          <div className="plan-row">
            <span className="plan-key">Recovery Ends</span>
            <span className="plan-val">{endDate}</span>
          </div>
          <div className="plan-row">
            <span className="plan-key">Reminders</span>
            <span className="plan-val">{plan.reminderTimes?.join(' & ')} daily ({plan.timezone?.replace(/_/g, ' ')})</span>
          </div>
          <div className="plan-row">
            <span className="plan-key">Patient Phone</span>
            <span className="plan-val">{plan.patientPhone}</span>
          </div>
          <div className="plan-row">
            <span className="plan-key">Doctor Phone</span>
            <span className="plan-val">{plan.doctorPhone}</span>
          </div>
        </div>

        <details className="plan-instructions-detail">
          <summary>View Instructions</summary>
          <pre className="plan-instructions-pre">{plan.instructions}</pre>
        </details>

        <div className="modal-actions">
          <button type="button" className="btn-outline" onClick={onEdit} disabled={saving}>
            Edit
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? 'Activating…' : 'Confirm & Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Setup({ existing, onSaved }) {
  const [procedureName, setProcedureName] = useState(existing?.procedureName || '')
  const [procedureDate, setProcedureDate] = useState(existing?.procedureDate || '')
  const [recoveryDays, setRecoveryDays] = useState(existing?.recoveryDays ?? '')
  const [recoveryDaysSuggested, setRecoveryDaysSuggested] = useState(false)
  const [patientName, setPatientName] = useState(existing?.patientName || '')
  const [patientPhone, setPatientPhone] = useState(existing?.patientPhone || '')
  const [doctorPhone, setDoctorPhone] = useState(existing?.doctorPhone || '')
  const [instructions, setInstructions] = useState(existing?.instructions || '')
  const [reminderTimes, setReminderTimes] = useState(existing?.reminderTimes || ['08:00'])
  const [timezone, setTimezone] = useState(existing?.timezone || 'America/New_York')
  const [newTime, setNewTime] = useState('20:00')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [instructionMode, setInstructionMode] = useState(existing?.instructions ? 'paste' : 'generate')
  const [showPlan, setShowPlan] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  function addTime() {
    if (reminderTimes.length >= 2 || reminderTimes.includes(newTime)) return
    setReminderTimes([...reminderTimes, newTime].sort())
  }

  function removeTime(t) {
    setReminderTimes(reminderTimes.filter(x => x !== t))
  }

  function handleFile(f) {
    if (!f) return
    setFile(f)
    if (f.type === 'text/plain') {
      const reader = new FileReader()
      reader.onload = e => setInstructions(e.target.result)
      reader.readAsText(f)
    }
  }

  // Called by InstructionGenerator when AI returns
  function handleGenerated({ instructions: text, recoveryDays: days, procedureName: name }) {
    setInstructions(text)
    if (name && !procedureName) setProcedureName(name)
    if (days) {
      setRecoveryDays(days)
      setRecoveryDaysSuggested(true)
    }
    setInstructionMode('paste')
  }

  function validate() {
    if (!procedureDate) return 'Procedure date is required.'
    if (!patientPhone || !doctorPhone) return 'Both phone numbers are required.'
    if (!instructions.trim()) return 'Aftercare instructions are required.'
    if (!reminderTimes.length) return 'Add at least one reminder time.'
    if (!recoveryDays || Number(recoveryDays) < 1) return 'Recovery period is required.'
    return null
  }

  function reviewPlan(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setShowPlan(true)
  }

  async function confirmAndSave() {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('procedureName', procedureName)
      fd.append('patientName', patientName)
      fd.append('patientPhone', patientPhone)
      fd.append('doctorPhone', doctorPhone)
      fd.append('procedureDate', procedureDate)
      fd.append('recoveryDays', recoveryDays)
      fd.append('instructions', instructions)
      fd.append('reminderTimes', JSON.stringify(reminderTimes))
      fd.append('timezone', timezone)
      if (file && instructionMode === 'upload') fd.append('instructionsFile', file)

      const res = await fetch('/api/setup', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSaved(data.config)
    } catch (err) {
      setError(err.message)
      setShowPlan(false)
    } finally {
      setSaving(false)
    }
  }

  const planPreview = {
    procedureName, patientName, procedureDate, recoveryDays: Number(recoveryDays),
    patientPhone, doctorPhone, reminderTimes, timezone, instructions,
  }

  return (
    <>
      {showPlan && (
        <RecoveryPlanModal
          plan={planPreview}
          onConfirm={confirmAndSave}
          onEdit={() => setShowPlan(false)}
          saving={saving}
        />
      )}

      <form onSubmit={reviewPlan}>
        {/* ── Procedure Info ── */}
        <div className="card">
          <div className="card-title">Procedure Details</div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="procedureName">Procedure Name</label>
              <input
                id="procedureName"
                type="text"
                placeholder="e.g. Laser Resurfacing"
                value={procedureName}
                onChange={e => setProcedureName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="patientName">Patient Name <span className="optional">(optional)</span></label>
              <input
                id="patientName"
                type="text"
                placeholder="e.g. Jane Smith"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="procedureDate">Procedure Date</label>
              <input
                id="procedureDate"
                type="date"
                value={procedureDate}
                onChange={e => setProcedureDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="recoveryDays">
                Recovery Period (days)
                {recoveryDaysSuggested && (
                  <span className="ai-badge">AI suggested</span>
                )}
              </label>
              <input
                id="recoveryDays"
                type="number"
                min="1"
                max="365"
                placeholder="e.g. 14"
                value={recoveryDays}
                onChange={e => { setRecoveryDays(e.target.value); setRecoveryDaysSuggested(false) }}
              />
              <span className="form-hint">
                {recoveryDaysSuggested
                  ? 'Suggested based on your procedure — adjust if needed'
                  : 'Generate instructions with AI to auto-fill this'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Instructions ── */}
        <div className="card">
          <div className="card-title">Aftercare Instructions</div>

          <div className="mode-tabs">
            {INSTRUCTION_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                className={instructionMode === m.id ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setInstructionMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {instructionMode === 'generate' && (
            <InstructionGenerator onGenerated={handleGenerated} />
          )}

          {instructionMode === 'paste' && (
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label htmlFor="instructions">Instructions</label>
              <textarea
                id="instructions"
                rows={10}
                placeholder="Paste or type aftercare instructions here…"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
              {instructions && (
                <span className="form-hint">{instructions.split('\n').length} lines · {instructions.length} chars</span>
              )}
            </div>
          )}

          {instructionMode === 'upload' && (
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Upload .txt file</label>
              <div
                className={`file-drop${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={e => handleFile(e.target.files[0])}
                />
                Click or drag a .txt file here
              </div>
              {file && <div className="file-name">{file.name}</div>}
              {instructions && (
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label>Preview</label>
                  <textarea rows={6} readOnly value={instructions} style={{ background: 'var(--color-surface-alt)' }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Contact Numbers ── */}
        <div className="card">
          <div className="card-title">Contact Numbers</div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="patientPhone">Patient Phone</label>
              <input
                id="patientPhone"
                type="tel"
                placeholder="+12125551234"
                value={patientPhone}
                onChange={e => setPatientPhone(e.target.value)}
                required
              />
              <span className="form-hint">Include country code, e.g. +1</span>
            </div>
            <div className="form-group">
              <label htmlFor="doctorPhone">Doctor Phone</label>
              <input
                id="doctorPhone"
                type="tel"
                placeholder="+12125559876"
                value={doctorPhone}
                onChange={e => setDoctorPhone(e.target.value)}
                required
              />
              <span className="form-hint">Photos forwarded here</span>
            </div>
          </div>
        </div>

        {/* ── Reminder Schedule ── */}
        <div className="card">
          <div className="card-title">Reminder Schedule</div>

          <div className="form-group">
            <label>Daily Reminder Times <span className="optional">(max 2)</span></label>
            <div className="time-pills">
              {reminderTimes.map(t => (
                <div key={t} className="time-pill">
                  <span>{t}</span>
                  <button type="button" onClick={() => removeTime(t)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
            {reminderTimes.length < 2 && (
              <div className="add-time-row">
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ width: 'auto' }}
                />
                <button type="button" className="btn-outline" onClick={addTime}>
                  + Add Time
                </button>
              </div>
            )}
            <span className="form-hint">Patient receives an SMS with instructions + photo upload link each day</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="timezone">Timezone</label>
              <select id="timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {procedureDate && reminderTimes.length > 0 && (
            <div className="calendar-banner">
              <div>
                <strong>Add to Calendar</strong>
                <p>Export recurring reminders with instructions to any calendar app.</p>
              </div>
              <a
                href="/api/calendar.ics"
                download
                className="btn-outline"
                style={{ textDecoration: 'none', display: 'inline-block', padding: '0.5rem 1rem', fontSize: '0.875rem', flexShrink: 0 }}
              >
                Download .ics
              </a>
            </div>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ marginTop: '1.25rem' }}>
          <button type="submit" className="btn-primary">
            Review Recovery Plan →
          </button>
        </div>
      </form>
    </>
  )
}
