import { useState, useRef } from 'react'

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

export default function Setup({ existing, onSaved }) {
  const [procedureName, setProcedureName] = useState(existing?.procedureName || '')
  const [patientPhone, setPatientPhone] = useState(existing?.patientPhone || '')
  const [doctorPhone, setDoctorPhone] = useState(existing?.doctorPhone || '')
  const [instructions, setInstructions] = useState(existing?.instructions || '')
  const [reminderTimes, setReminderTimes] = useState(existing?.reminderTimes || ['08:00'])
  const [timezone, setTimezone] = useState(existing?.timezone || 'America/New_York')
  const [newTime, setNewTime] = useState('12:00')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  function addTime() {
    if (reminderTimes.length >= 2) return
    if (!reminderTimes.includes(newTime)) {
      setReminderTimes([...reminderTimes, newTime].sort())
    }
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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!patientPhone || !doctorPhone || !instructions.trim()) {
      setError('Patient phone, doctor phone, and instructions are all required.')
      return
    }
    if (reminderTimes.length === 0) {
      setError('Add at least one reminder time.')
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('procedureName', procedureName)
      fd.append('patientPhone', patientPhone)
      fd.append('doctorPhone', doctorPhone)
      fd.append('instructions', instructions)
      fd.append('reminderTimes', JSON.stringify(reminderTimes))
      fd.append('timezone', timezone)
      if (file) fd.append('instructionsFile', file)

      const res = await fetch('/api/setup', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.config)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-title">Procedure Details</div>

        <div className="form-group">
          <label htmlFor="procedureName">Procedure Name</label>
          <input
            id="procedureName"
            type="text"
            placeholder="e.g. Laser Resurfacing, Chemical Peel"
            value={procedureName}
            onChange={e => setProcedureName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Aftercare Instructions</label>
          <textarea
            placeholder="Paste aftercare instructions here…"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={6}
          />
          <span className="form-hint">Or upload a plain-text (.txt) file below</span>
        </div>

        <div className="form-group">
          <label>Upload Instructions File (optional)</label>
          <div
            className={`file-drop${dragOver ? ' drag-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              handleFile(e.dataTransfer.files[0])
            }}
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
        </div>
      </div>

      <div className="card">
        <div className="card-title">Contact Numbers</div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="patientPhone">Patient Phone Number</label>
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
            <label htmlFor="doctorPhone">Doctor Phone Number</label>
            <input
              id="doctorPhone"
              type="tel"
              placeholder="+12125559876"
              value={doctorPhone}
              onChange={e => setDoctorPhone(e.target.value)}
              required
            />
            <span className="form-hint">Photos from patient will forward here</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Reminder Schedule</div>

        <div className="form-group">
          <label>Reminder Times <span style={{ fontWeight: 400, textTransform: 'none' }}>(max 2 per day)</span></label>
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
                Add Time
              </button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="timezone">Timezone</label>
          <select id="timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginTop: '1.25rem' }}>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Save Changes' : 'Save & Activate'}
        </button>
      </div>
    </form>
  )
}
