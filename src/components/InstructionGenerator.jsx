import { useState } from 'react'

const PROCEDURES = [
  'Laser skin resurfacing',
  'CO2 fractional laser',
  'IPL photofacial',
  'Chemical peel (light)',
  'Chemical peel (medium/deep)',
  'Microneedling',
  'Microneedling with PRP',
  'Hydrafacial',
  'Botox / Dysport',
  'Dermal filler',
  'Radiofrequency skin tightening',
  'Ultherapy',
  'Laser hair removal',
  'Tattoo removal laser',
  'Photodynamic therapy (PDT)',
  'Other (describe below)',
]

export default function InstructionGenerator({ onGenerated }) {
  const [selected, setSelected] = useState('')
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const procedureType = selected === 'Other (describe below)' ? custom : selected

  async function generate() {
    if (!procedureType.trim()) {
      setError('Please select or describe a procedure.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/generate-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedureType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // data = { instructions, recoveryDays, procedureName }
      onGenerated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="generator-box">
      <div className="form-group">
        <label htmlFor="proc-select">Procedure Type</label>
        <select
          id="proc-select"
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          <option value="">Select a procedure…</option>
          {PROCEDURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {selected === 'Other (describe below)' && (
        <div className="form-group">
          <label htmlFor="proc-custom">Describe the procedure</label>
          <input
            id="proc-custom"
            type="text"
            placeholder="e.g. Erbium laser facial rejuvenation"
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <button
        type="button"
        className="btn-primary"
        onClick={generate}
        disabled={loading || !selected}
      >
        {loading ? 'Generating…' : 'Generate with AI'}
      </button>
      {loading && (
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
          Generating instructions and recovery plan…
        </p>
      )}
    </div>
  )
}
