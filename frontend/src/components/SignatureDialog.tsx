import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { uid } from '../model'
import type { Mark, MarkKind } from '../types'

const INKS = [
  { color: '#111827', name: 'Black ink' },
  { color: '#1e3a8a', name: 'Blue ink' },
]
const RES = 3 // canvas pixels per CSS pixel, so the saved image stays sharp when scaled
const PEN = 2.6
const MINE: Record<MarkKind, string> = { signature: 'My signature', initials: 'My initials' }

export interface DrawRequest {
  kind: MarkKind
  /** Set when redrawing a saved one; otherwise a new one is added. */
  mark?: Mark
}

interface Props {
  request: DrawRequest
  marks: Mark[]
  onClose: () => void
  onSaved: (mark: { id: string; kind: MarkKind }) => Promise<void>
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

/** Draw a signature or initials, give it a name, and add it to the library. */
export function SignatureDialog({ request, marks, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<MarkKind>(request.kind)
  const [editing, setEditing] = useState<Mark | undefined>(request.mark)
  const firstOf = (k: MarkKind) => !marks.some((m) => m.kind === k)
  const [name, setName] = useState(request.mark?.name ?? (firstOf(request.kind) ? MINE[request.kind] : ''))
  const [ink, setInk] = useState(INKS[0].color)
  const [empty, setEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const drawing = useRef<{ last: [number, number]; mid: [number, number] } | null>(null)
  const bbox = useRef<[number, number, number, number] | null>(null)

  const clear = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    bbox.current = null
    setEmpty(true)
  }, [])

  // Size the canvas to its box at high resolution.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const fit = () => {
      const r = c.getBoundingClientRect()
      c.width = Math.round(r.width * RES)
      c.height = Math.round(r.height * RES)
      bbox.current = null
      setEmpty(true)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Adding someone else's: ask for the name first.
  useEffect(() => {
    if (!name) nameRef.current?.focus()
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) * RES, (e.clientY - r.top) * RES]
  }

  const grow = ([x, y]: [number, number]) => {
    const b = bbox.current
    bbox.current = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y]
  }

  const stroke = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = ink
    ctx.lineWidth = PEN * RES
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = point(e)
    drawing.current = { last: p, mid: p }
    const ctx = e.currentTarget.getContext('2d')!
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(p[0], p[1], (PEN * RES) / 2, 0, Math.PI * 2)
    ctx.fill()
    grow(p)
    setEmpty(false)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current
    if (!d) return
    const p = point(e)
    const mid: [number, number] = [(d.last[0] + p[0]) / 2, (d.last[1] + p[1]) / 2]
    const ctx = e.currentTarget.getContext('2d')!
    stroke(ctx)
    ctx.beginPath()
    ctx.moveTo(d.mid[0], d.mid[1])
    ctx.quadraticCurveTo(d.last[0], d.last[1], mid[0], mid[1])
    ctx.stroke()
    drawing.current = { last: p, mid }
    grow(p)
  }

  // Finish the stroke: the curve above always stops half a segment short.
  const up = () => {
    const d = drawing.current
    const c = canvasRef.current
    if (d && c) {
      const ctx = c.getContext('2d')!
      stroke(ctx)
      ctx.beginPath()
      ctx.moveTo(d.mid[0], d.mid[1])
      ctx.lineTo(d.last[0], d.last[1])
      ctx.stroke()
    }
    drawing.current = null
  }

  const save = async () => {
    const c = canvasRef.current
    const b = bbox.current
    if (!c || !b) return
    const pad = PEN * RES * 2
    const x = Math.max(0, Math.floor(b[0] - pad))
    const y = Math.max(0, Math.floor(b[1] - pad))
    const w = Math.min(c.width, Math.ceil(b[2] + pad)) - x
    const h = Math.min(c.height, Math.ceil(b[3] + pad)) - y
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    out.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/png'))
    if (!blob) return
    setSaving(true)
    setError('')
    try {
      const id = editing?.id ?? `${slug(name) || kind}-${uid()}`
      await api.saveMark(id, name.trim() || MINE[kind], kind, blob)
      await onSaved({ id, kind })
      // Someone's very first signature: offer their initials next.
      if (!editing && kind === 'signature' && name.trim() === MINE.signature && firstOf('initials')) {
        setKind('initials')
        setName(MINE.initials)
        setEditing(undefined)
        clear()
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const switchKind = (k: MarkKind) => {
    setKind(k)
    if (!name || name === MINE[kind]) setName(firstOf(k) ? MINE[k] : '')
    clear()
  }

  const word = kind === 'signature' ? 'signature' : 'initials'
  const title = editing ? `Redraw ${editing.name}` : kind === 'signature' ? 'Add a signature' : 'Add initials'

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="sig-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 id="sig-title">{title}</h2>
            <p>Draw it once. It's saved on this computer and can go on any form.</p>
          </div>
          {!editing && (
            <div className="tabs" role="tablist" aria-label="Kind">
              <button type="button" role="tab" aria-selected={kind === 'signature'} onClick={() => switchKind('signature')}>
                Signature
              </button>
              <button type="button" role="tab" aria-selected={kind === 'initials'} onClick={() => switchKind('initials')}>
                Initials
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="sig-name" className="muted">
            Whose {word}?
          </label>
          <input
            id="sig-name"
            ref={nameRef}
            className="field"
            value={name}
            maxLength={60}
            placeholder={`e.g. Alan Lysne (witness)`}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="pad">
          <span className="x" aria-hidden="true">
            ×
          </span>
          <div className="baseline" />
          {empty && <span className="hint">Draw with your mouse or trackpad</span>}
          <canvas
            ref={canvasRef}
            aria-label={`Drawing area for the ${word}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span className="cap">Ink</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {INKS.map((i) => (
              <button
                key={i.color}
                type="button"
                className="swatch"
                aria-label={i.name}
                aria-pressed={ink === i.color}
                style={{ background: i.color }}
                onClick={() => setInk(i.color)}
              />
            ))}
          </div>
          <span className="muted">Pick before drawing.</span>
          <div className="spacer" />
          <button className="pill pill-glass" type="button" onClick={clear} disabled={empty}>
            Clear
          </button>
        </div>

        {error && <p style={{ color: 'var(--warn-ink)' }}>{error}</p>}

        <div className="dialog-actions" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
          <button className="pill pill-glass" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="pill pill-red" type="button" onClick={save} disabled={empty || saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save' : `Save ${word}`}
          </button>
        </div>
      </section>
    </div>
  )
}
