import { useState, useEffect, useCallback } from 'react'
import Setup from './components/Setup.jsx'
import Dashboard from './components/Dashboard.jsx'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      setConfig(Object.keys(data).length ? data : null)
    } catch {
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // If no config yet, land on setup
  useEffect(() => {
    if (!loading && !config) setTab('setup')
  }, [loading, config])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <span className="app-brand-icon">+</span>
            AfterCare
          </div>
          <nav className="app-nav">
            <button
              className={tab === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={tab === 'setup' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setTab('setup')}
            >
              {config ? 'Edit Setup' : 'Setup'}
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : tab === 'setup' ? (
          <Setup
            existing={config}
            onSaved={(cfg) => {
              setConfig(cfg)
              setTab('dashboard')
            }}
          />
        ) : (
          <Dashboard config={config} onRefresh={fetchConfig} />
        )}
      </main>
    </div>
  )
}
