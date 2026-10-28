import { api } from '../api'
import { DATE_FORMATS, formatDate } from '../dates'
import type { Mark, MarkKind, Settings as SettingsT, Status } from '../types'
import { ProfileCard } from './ProfileCard'
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
  const settings = status?.settings

  const save = async (patch: Partial<SettingsT>) => {
    try {
      onSettingsChange(await api.saveSettings(patch))
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
              {id === 'profile' && <span className="hint">{status?.profile.count ?? ''}</span>}
            </a>
          ))}
        </nav>
      </Sidebar>

      <main className="settings">
        <h1>Settings</h1>
        <div className="cards">
          <ProfileCard onSaved={() => void onRefresh()} />

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
