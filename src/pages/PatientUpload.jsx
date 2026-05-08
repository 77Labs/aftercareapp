import { useState, useEffect, useRef } from 'react'

function getToken() {
  return new URLSearchParams(window.location.search).get('t') || ''
}

export default function PatientUpload() {
  const token = getToken()
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    if (!token) { setInfoError('Invalid link. Please use the link from your reminder message.'); return }
    fetch(`/api/patient/info?t=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setInfoError(d.error)
        else setInfo(d)
      })
      .catch(() => setInfoError('Could not load your plan. Check your internet connection.'))
  }, [token])

  function handlePhotoChange(file) {
    if (!file || !file.type.startsWith('image/')) return
    setPhoto(file)
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!photo) { setUploadError('Please select a photo first.'); return }
    setUploadError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', photo)
      const res = await fetch(`/api/patient/upload?t=${token}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (infoError) {
    return (
      <div className="patient-wrap">
        <div className="patient-card">
          <div className="patient-brand">+ AfterCare</div>
          <div className="patient-error">{infoError}</div>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="patient-wrap">
        <div className="patient-card">
          <div className="patient-brand">+ AfterCare</div>
          <div className="patient-loading">Loading your plan…</div>
        </div>
      </div>
    )
  }

  if (result) {
    const pct = Math.min(100, Math.round((result.day / result.recoveryDays) * 100))
    return (
      <div className="patient-wrap">
        <div className="patient-card">
          <div className="patient-brand">+ AfterCare</div>
          <div className="patient-success-icon">✓</div>
          <h2 className="patient-success-title">Photo sent to your doctor!</h2>
          <p className="patient-success-sub">Day {result.day} of {result.recoveryDays} · {pct}% through recovery</p>
          <div className="patient-progress">
            <div className="patient-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {preview && (
            <img src={preview} alt="Your upload" className="patient-photo-preview" />
          )}
          <div className="patient-note-box">
            <div className="patient-note-label">Your recovery update</div>
            <p className="patient-note">{result.note}</p>
          </div>
          <p className="patient-footer">Keep following your aftercare instructions. You're doing great!</p>
        </div>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((info.day / info.recoveryDays) * 100))

  return (
    <div className="patient-wrap">
      <div className="patient-card">
        <div className="patient-brand">+ AfterCare</div>

        <h1 className="patient-procedure">{info.procedureName}</h1>
        {info.patientName && <p className="patient-name">Hi, {info.patientName.split(' ')[0]}!</p>}

        <div className="patient-day-badge">
          Day {info.day} <span>of {info.recoveryDays}</span>
        </div>

        <div className="patient-progress">
          <div className="patient-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="patient-pct">{pct}% through recovery</p>

        <details className="patient-instructions">
          <summary>Today's instructions</summary>
          <pre className="patient-instructions-text">{info.instructions}</pre>
        </details>

        <form onSubmit={handleUpload}>
          <div
            className={`patient-drop-zone${preview ? ' has-preview' : ''}`}
            onClick={() => !preview && fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handlePhotoChange(e.dataTransfer.files[0]) }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => handlePhotoChange(e.target.files[0])}
              style={{ display: 'none' }}
            />
            {preview ? (
              <div className="patient-preview-wrap">
                <img src={preview} alt="Preview" className="patient-preview-img" />
                <button
                  type="button"
                  className="patient-change-photo"
                  onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
                >
                  Change photo
                </button>
              </div>
            ) : (
              <div className="patient-drop-inner">
                <div className="patient-camera-icon">📷</div>
                <p>Tap to take a photo or choose from gallery</p>
                <span>JPG, PNG, HEIC up to 20 MB</span>
              </div>
            )}
          </div>

          {uploadError && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{uploadError}</div>}

          <button
            type="submit"
            className="patient-submit"
            disabled={uploading || !photo}
          >
            {uploading ? 'Sending to doctor…' : 'Send Update to Doctor'}
          </button>
        </form>
      </div>
    </div>
  )
}
