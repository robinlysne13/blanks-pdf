import { useEffect, useState } from 'react'
import { api } from '../api'
import { Icon } from '../icons'
import { exportPayload, isFilled } from '../model'
import type { FieldValue, OpenDoc, Overlay } from '../types'

interface Props {
  doc: OpenDoc
  values: Record<string, FieldValue>
  overlays: Overlay[]
  onClose: () => void
  onShowClaude: () => void
  onDone: (filename: string) => void
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export function DownloadDialog({ doc, values, overlays, onClose, onShowClaude, onDone }: Props) {
  const signed = overlays.some((o) => o.kind === 'image')
  const base = doc.name.replace(/\.pdf$/i, '')
  const [filename, setFilename] = useState(`${base}-${signed ? 'signed' : 'filled'}.pdf`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filled = Object.values(values).filter(isFilled).length
  const signers = [...new Set(overlays.filter((o) => o.kind === 'image').map((o) => o.label))]
  const count = (pred: (o: Overlay) => boolean) => overlays.filter(pred).length
  const lines = [
    filled && plural(filled, 'form field') + ' filled',
    signers.length > 0 && `Signed: ${signers.join(', ')}`,
    count((o) => o.kind === 'text') && plural(count((o) => o.kind === 'text'), 'text box', 'text boxes'),
    count((o) => o.kind === 'check' || o.kind === 'cross') && plural(count((o) => o.kind === 'check' || o.kind === 'cross'), 'mark'),
  ].filter(Boolean) as string[]
  const unchecked = Object.values(values).filter((v) => v.source === 'claude').length + count((o) => o.source === 'claude')

  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const p = exportPayload(values, overlays)
      const blob = await api.export(doc.id, p.values, p.overlays)
      const name = filename.trim().replace(/[/\\]/g, '-') || 'filled.pdf'
      const finalName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = finalName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      onDone(finalName)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dl-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 id="dl-title">Download {signed ? 'signed' : 'filled'} PDF</h2>
          <p>Everything is flattened into the page. Nobody can move or edit {signed ? 'your signature' : 'what you wrote'} afterwards.</p>
        </div>

        <div className="box">
          <span className="cap">What goes in</span>
          {lines.length ? (
            lines.map((l) => (
              <div key={l} className="li">
                <Icon.check size={16} strokeWidth={2.2} style={{ color: 'var(--good)' }} />
                {l}
              </div>
            ))
          ) : (
            <div className="li">Nothing yet. The PDF downloads unchanged.</div>
          )}
        </div>

        {unchecked > 0 && (
          <div className="notice-claude">
            <Icon.sparkle style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontWeight: 600 }}>{plural(unchecked, 'value')} from Claude still unchecked.</strong>
              <button type="button" className="link-btn" style={{ color: 'var(--claude-ink)', textDecoration: 'underline', alignSelf: 'flex-start' }} onClick={onShowClaude}>
                Show them
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="dl-name" className="muted">
            File name
          </label>
          <input id="dl-name" className="field mono" value={filename} onChange={(e) => setFilename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && download()} />
          <span className="muted" style={{ fontSize: 12 }}>
            Saves to your Downloads folder. Blanks keeps no copy.
          </span>
        </div>

        {error && <p style={{ color: 'var(--warn-ink)' }}>{error}</p>}

        <div className="dialog-actions">
          <button className="pill pill-glass" type="button" onClick={onClose}>
            Back to editing
          </button>
          <button className="pill pill-red" type="button" onClick={download} disabled={busy}>
            <Icon.download size={17} />
            {busy ? 'Building…' : 'Download'}
          </button>
        </div>
      </section>
    </div>
  )
}
