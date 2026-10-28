import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { DATE_FORMATS, formatDate } from '../dates'
import type { Mark, MarkKind, Settings as SettingsT, Status } from '../types'
import { Sidebar } from './Sidebar'

interface Props {
  status: Status | null
  marks: Record<MarkKind, Mark | null>
  hasDoc: boolean
  onBack: () => void
  onOpenPdf: () => void
  onDrawMark: (kind: MarkKind) => void
  onSettingsChange: (s: SettingsT) => void
  onRefresh: () => Promise<void>
  onToast: (m: string) => void
}

export function Settings({ status, marks, hasDoc, onBack, onOpenPdf, onDrawMark, onSettingsChange, onRefresh, onToast }: Props) {
  const [profile, setProfile] = useState<{ path: string; exists: boolean; entries: { key: string; value: string }[] } | null>(null)
  // Values stay hidden until asked for, so a screen share or screenshot doesn't show them.
  const [reveal, setReveal] = useState(false)
  const settings = status?.settings

  const loadProfile = useCallback(() => {
    api.profile().then(setProfile).catch((e) => onToast(e.message))
  }, [onToast])

  useEffect(() => {
    loadProfile()
    // Pick up edits made in the text editor when the person comes back.
    const onFocus = () => {
      loadProfile()
      void onRefresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadProfile, onRefresh])

  const save = async (patch: Partial<SettingsT>) => {
    try {
      onSettingsChange(await api.saveSettings(patch))
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e))
    }
  }

  const openProfile = async () => {
    try {
      const { path } = await api.openProfile()
      onToast(`Opened ${path}. Save it, then come back here.`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e))
    }
  }

  const sections = [
    ['profile', 'Profile'],
    ['claude', 'Claude'],
    ['marks', 'Signature and initials'],
    ['defaults', 'Defaults'],
  ]

  return (
    <div className="app">
      <Sidebar onOpenPdf={onOpenPdf} onSettings={() => {}} settingsActive>
        <nav className="nav-list" aria-label="Settings sections">
          <div className="cap">Settings</div>
          {hasDoc && (
            <button className="nav" type="button" onClick={onBack}>
              <span className="grow">← Back to the form</span>
            </button>
          )}
          {sections.map(([id, label]) => (
            <a key={id} className="nav" href={`#${id}`}>
              <span className="grow">{label}</span>
              {id === 'profile' && <span className="hint">{profile?.entries.length ?? ''}</span>}
            </a>
          ))}
        </nav>
      </Sidebar>

      <main className="settings">
        <h1>Settings</h1>
        <div className="cards">
          <section id="profile" className="card glass">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <h2>Profile</h2>
              <button className="pill pill-glass pill-sm" type="button" onClick={openProfile}>
                {profile?.exists ? 'Open in editor' : 'Create profile'}
              </button>
            </div>
            <p>What Claude may use to fill forms. A plain text file you edit yourself. It lives outside the repo and is never committed.</p>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.7)', overflowWrap: 'anywhere' }}>
              {profile?.path ?? '…'}
            </span>
            {profile && profile.entries.length > 0 ? (
              <div>
                {(reveal ? profile.entries : profile.entries.slice(0, 6)).map((e) => (
                  <div key={e.key} className="kv">
                    <span>{e.key}</span>
                    <span style={{ textAlign: 'right', overflowWrap: 'anywhere' }} aria-label={reveal ? undefined : 'hidden'}>
                      {reveal ? e.value : '••••••'}
                    </span>
                  </div>
                ))}
                <div className="kv" style={{ borderBottom: 'none', alignItems: 'center' }}>
                  <span>{!reveal && profile.entries.length > 6 ? `+ ${profile.entries.length - 6} more` : `${profile.entries.length} details`}</span>
                  <button type="button" className="link-btn" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
                    {reveal ? 'Hide values' : 'Show values'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">{profile?.exists ? 'No details filled in yet. Replace the [placeholders] with your own.' : 'No profile yet. Create one to use auto-fill.'}</p>
            )}
          </section>

          <section id="claude" className="card glass">
            <h2>Claude</h2>
            <p>Auto-fill runs Claude Code on this computer, so it uses your Claude subscription. No API key, no extra cost.</p>
            <div className="ok-box" style={status?.claude.available ? { background: 'var(--good-bg)', color: 'var(--good-ink)' } : { background: 'var(--warn-bg)', color: 'var(--warn-ink)' }}>
              <span className="dot" style={{ background: status?.claude.available ? 'var(--good)' : 'var(--warn)' }} />
              <span>{status?.claude.available ? 'Claude Code found' : 'Claude Code not found. Install it and run `claude` once to sign in.'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="cap">Claude sees</span>
              <p style={{ color: 'var(--ink-2)' }}>Your profile and the open form: field names and labels, or page images for scans. Nothing else on this computer.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, minHeight: 44 }}>
              <span id="send-images">Send page images for scanned forms</span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-labelledby="send-images"
                aria-checked={settings?.send_images ?? true}
                onClick={() => save({ send_images: !(settings?.send_images ?? true) })}
              />
            </div>
          </section>

          <section id="marks" className="card glass">
            <h2>Signature and initials</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {(['signature', 'initials'] as const).map((k) => (
                <div key={k} className="mark-tile">
                  <span className="cap">{k}</span>
                  {marks[k] ? <img src={marks[k]!.url} alt={`Your saved ${k}`} /> : <span className="muted" style={{ height: 44, display: 'flex', alignItems: 'center' }}>Not drawn yet</span>}
                  <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onDrawMark(k)}>
                    {marks[k] ? 'Redraw' : 'Draw'}
                  </button>
                </div>
              ))}
            </div>
            <p className="muted">Stored as transparent images in your Blanks folder.</p>
          </section>

          <section id="defaults" className="card glass">
            <h2>Defaults</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="date-format" className="muted">
                Date format for the date stamp
              </label>
              <select id="date-format" className="field" value={settings?.date_format ?? 'long'} onChange={(e) => save({ date_format: e.target.value as SettingsT['date_format'] })}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {formatDate(f)}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
