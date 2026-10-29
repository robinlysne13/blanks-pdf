import { useState } from 'react'
import { api } from '../api'
import type { Mark, MarkKind } from '../types'

interface Props {
  marks: Mark[]
  onDraw: (kind: MarkKind, mark?: Mark) => void
  onChanged: () => Promise<void>
  onToast: (m: string) => void
}

/** Settings card: every saved signature and set of initials, with rename,
 *  redraw and delete. */
export function SignatureLibrary({ marks, onDraw, onChanged, onToast }: Props) {
  const [names, setNames] = useState<Record<string, string>>({})

  const rename = async (m: Mark) => {
    const name = (names[m.id] ?? m.name).trim()
    if (!name || name === m.name) return
    try {
      await api.renameMark(m.id, name)
      await onChanged()
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (m: Mark) => {
    if (!window.confirm(`Delete ${m.name}? Forms already downloaded keep it.`)) return
    try {
      await api.deleteMark(m.id)
      await onChanged()
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section id="marks" className="card glass">
      <h2>Signatures</h2>
      <p>Everyone whose signature or initials you keep on this computer, like your own and a witness's.</p>
      {marks.length === 0 ? (
        <p className="muted">None saved yet.</p>
      ) : (
        <div className="lib-grid">
          {marks.map((m) => (
            <div key={m.id} className="mark-tile">
              <span className="cap">{m.kind}</span>
              <img src={m.url} alt={m.name} />
              <input
                className="lib-name-input"
                aria-label={`Name of ${m.name}`}
                value={names[m.id] ?? m.name}
                maxLength={60}
                onChange={(e) => setNames((n) => ({ ...n, [m.id]: e.target.value }))}
                onBlur={() => void rename(m)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="link-btn" onClick={() => onDraw(m.kind, m)}>
                  Redraw
                </button>
                <button type="button" className="link-btn" style={{ color: 'var(--muted)' }} onClick={() => void remove(m)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="pill pill-glass pill-sm" onClick={() => onDraw('signature')}>
          + Add a signature
        </button>
        <button type="button" className="pill pill-glass pill-sm" onClick={() => onDraw('initials')}>
          + Add initials
        </button>
      </div>
    </section>
  )
}
