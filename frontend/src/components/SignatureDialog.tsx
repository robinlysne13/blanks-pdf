import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Mark, MarkKind } from '../types'

const INKS = [
  { color: '#111827', name: 'Black ink' },
  { color: '#1e3a8a', name: 'Blue ink' },
]
const RES = 3 // canvas pixels per CSS pixel, so the saved image stays sharp when scaled
const PEN = 2.6

interface Props {
  initialTab: MarkKind
  marks: Record<MarkKind, Mark | null>
  onClose: () => void
  onSaved: (kind: MarkKind) => Promise<void>
}

export function SignatureDialog({ initialTab, marks, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<MarkKind>(initialTab)
  const [ink, setInk] = useState(INKS[0].color)
  const [empty, setEmpty] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
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

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) * RES, (e.clientY - r.top) * RES]
  }

  const grow = ([x, y]: [number, number]) => {
    const b = bbox.current
    bbox.current = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y]
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
    ctx.strokeStyle = ink
    ctx.lineWidth = PEN * RES
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
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
      ctx.strokeStyle = ink
      ctx.lineWidth = PEN * RES
      ctx.lineCap = 'round'
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
      await api.saveMark(tab, blob)
      await onSaved(tab)
      if (tab === 'signature' && !marks.initials) {
        setTab('initials')
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

  const switchTab = (t: MarkKind) => {
    setTab(t)
    clear()
  }

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="sig-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 id="sig-title">Draw it once</h2>
            <p>Blanks reuses it on every form. It is saved on this computer only.</p>
          </div>
          <div className="tabs" role="tablist" aria-label="Mark">
            <button type="button" role="tab" aria-selected={tab === 'signature'} onClick={() => switchTab('signature')}>
              Signature
            </button>
            <button type="button" role="tab" aria-selected={tab === 'initials'} onClick={() => switchTab('initials')}>
              Initials
            </button>
          </div>
        </div>

        <div className="pad">
          <span className="x" aria-hidden="true">
            ×
          </span>
          <div className="baseline" />
          {empty && <span className="hint">Draw with your mouse or trackpad</span>}
          <canvas
            ref={canvasRef}
            aria-label={`Drawing area for your ${tab}`}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
          <span className="muted">
            {tab === 'signature'
              ? marks.initials
                ? 'Your initials are already saved.'
                : 'Next: initials, also drawn once.'
              : marks.initials
                ? 'This replaces your saved initials.'
                : 'Used wherever a form says "initial here".'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill pill-glass" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="pill pill-red" type="button" onClick={save} disabled={empty || saving}>
              {saving ? 'Saving…' : tab === 'signature' ? 'Save signature' : 'Save initials'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
