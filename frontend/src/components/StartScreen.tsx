import { useState } from 'react'
import { Icon } from '../icons'
import type { Mark, MarkKind, Status } from '../types'
import { Sidebar } from './Sidebar'

const SAMPLES = [
  { file: 'lease-renewal.pdf', label: 'fillable lease form' },
  { file: 'intake-form.pdf', label: 'flat intake form' },
  { file: 'intake-scan.pdf', label: 'scanned intake form' },
]

interface Props {
  status: Status | null
  marks: Record<MarkKind, Mark | null>
  busy: boolean
  onFile: (file: File) => void
  onChoose: () => void
  onSettings: () => void
  onDrawMark: (kind: MarkKind) => void
}

export function StartScreen({ status, marks, busy, onFile, onChoose, onSettings, onDrawMark }: Props) {
  const [over, setOver] = useState(false)
  const claudeReady = status?.claude.available ?? false

  const openSample = async (file: string) => {
    const res = await fetch(`/samples/${file}`)
    onFile(new File([await res.blob()], file, { type: 'application/pdf' }))
  }

  return (
    <div className="app">
      <Sidebar onOpenPdf={onChoose} onSettings={onSettings}>
        <nav className="nav-list" aria-label="Setup">
          <div className="cap">Setup</div>
          <button className="nav" type="button" onClick={() => onDrawMark('signature')}>
            <Icon.signature />
            <span className="grow">Signature</span>
            <span className="hint">{marks.signature ? 'Saved' : 'Draw it'}</span>
          </button>
          <button className="nav" type="button" onClick={() => onDrawMark('initials')}>
            <Icon.initials />
            <span className="grow">Initials</span>
            <span className="hint">{marks.initials ? 'Saved' : 'Draw them'}</span>
          </button>
          <button className="nav" type="button" onClick={onSettings}>
            <Icon.person />
            <span className="grow">Profile</span>
            <span className="hint">{status?.profile.exists ? status.profile.count : 'Add it'}</span>
          </button>
          <button className="nav" type="button" onClick={onSettings}>
            <Icon.sparkle />
            <span className="grow">Claude</span>
            <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dot" style={{ background: claudeReady ? 'var(--good)' : 'var(--warn)' }} />
              {claudeReady ? 'Ready' : 'Not found'}
            </span>
          </button>
        </nav>
      </Sidebar>

      <main className="start">
        <div
          className={`drop glass${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (file) onFile(file)
          }}
        >
          <div className="drop-icon">
            <Icon.file size={30} />
          </div>
          <h1>Drop a PDF to fill in</h1>
          <p>Fillable forms and scanned pages both work. The file never leaves this computer.</p>
          <div style={{ paddingTop: 10 }}>
            <button className="pill pill-red" type="button" onClick={onChoose} disabled={busy}>
              {busy ? <span className="spin" /> : null}
              {busy ? 'Opening…' : 'Choose a PDF'}
            </button>
          </div>
          <span className="muted">
            or press <kbd>⌘O</kbd>
          </span>
          <span className="muted" style={{ paddingTop: 6 }}>
            No form handy? Try a sample:{' '}
            {SAMPLES.map((s, i) => (
              <span key={s.file}>
                {i > 0 && ' · '}
                <button type="button" className="link-btn" onClick={() => openSample(s.file)} disabled={busy}>
                  {s.label}
                </button>
              </span>
            ))}
          </span>
        </div>

        <div className="status-chips">
          <button type="button" className="glass" onClick={() => onDrawMark('signature')}>
            {marks.signature ? (
              <>
                <img src={marks.signature.url} alt="Your saved signature" style={{ height: 20 }} />
                Signature ready
              </>
            ) : (
              <>
                <Icon.signature size={16} /> Draw your signature once
              </>
            )}
          </button>
          <button type="button" className="glass" onClick={onSettings}>
            <span className="dot" style={{ background: claudeReady ? 'var(--good)' : 'var(--warn)' }} />
            {claudeReady ? 'Auto-fill uses your Claude subscription' : 'Install Claude Code to use auto-fill'}
          </button>
        </div>
      </main>
    </div>
  )
}
