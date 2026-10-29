import { useLayoutEffect, useRef } from 'react'
import { Icon } from '../icons'
import type { FieldGroup } from '../model'
import type { FieldValue, Mark, MarkKind, Overlay, PageInfo, PdfField, Tool } from '../types'

interface Props {
  page: PageInfo
  image: string | null
  zoom: number
  tool: Tool
  fields: PdfField[]
  groups: Map<string, FieldGroup>
  values: Record<string, FieldValue>
  overlays: Overlay[]
  marks: Record<MarkKind, Mark | null>
  selected: string | null
  editing: string | null
  onPlace: (x: number, y: number) => void
  onSignIn: (rect: PdfField['rect']) => void
  onBackground: () => void
  onFieldChange: (name: string, value: string | boolean) => void
  onSelect: (id: string) => void
  onEdit: (id: string | null) => void
  onChange: (id: string, patch: Partial<Overlay>) => void
  onRemove: (id: string) => void
}

/** Blurring the text box being typed in saves it (its onBlur commits). */
function commitOpenText() {
  const active = document.activeElement as HTMLElement | null
  if (active?.isContentEditable) active.blur()
}

/** One PDF page: the rendered image, live inputs over its form fields, and
 *  everything the person has placed on it. Positions are PDF points × zoom. */
export function PageView(props: Props) {
  const { page, image, zoom, tool, fields, values, overlays, selected, editing } = props
  const placing = tool !== 'select'

  const pointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    commitOpenText()
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / zoom
    const y = (e.clientY - r.top) / zoom
    if (placing) {
      // Keep the browser from moving focus to the page, which would pull it
      // straight back out of a text box we are about to open.
      e.preventDefault()
      props.onPlace(x, y)
    } else props.onBackground()
  }

  return (
    <div
      className={`page${placing ? ' tool-place' : ''}`}
      style={{ width: page.width * zoom, height: page.height * zoom }}
      onPointerDown={pointerDown}
    >
      {image && <img src={image} alt="" draggable={false} />}
      {fields.map((f) => (
        <FieldInput key={f.id} {...props} field={f} value={values[f.name]} />
      ))}
      {overlays.map((o) => (
        <OverlayView key={o.id} o={o} {...props} isSelected={selected === o.id} isEditing={editing === o.id} />
      ))}
    </div>
  )
}

function FieldInput({ field: f, zoom, value, groups, onFieldChange, onSignIn }: Props & { field: PdfField; value?: FieldValue }) {
  const [x0, y0, x1, y1] = f.rect
  const style = { left: x0 * zoom, top: y0 * zoom, width: (x1 - x0) * zoom, height: (y1 - y0) * zoom }
  const h = y1 - y0
  const claude = value?.source === 'claude' ? ' claude' : ''
  const label = f.label || f.context.split(' | ')[0] || f.name

  if (f.type === 'signature') {
    return (
      <button
        type="button"
        className="f-box"
        style={{ ...style, borderStyle: 'dashed', fontSize: Math.min(h * 0.5, 11) * zoom, color: 'var(--red-deep)' }}
        onClick={() => onSignIn(f.rect)}
      >
        Sign here
      </button>
    )
  }
  if (f.type === 'checkbox' || f.type === 'radio') {
    const on = f.type === 'checkbox' ? value?.value === true : value?.value === f.on_state
    return (
      <button
        type="button"
        role={f.type === 'checkbox' ? 'checkbox' : 'radio'}
        aria-checked={on}
        aria-label={label}
        className={`f-box${f.type === 'radio' ? ' radio' : ''}${claude}`}
        style={style}
        onClick={() => onFieldChange(f.name, f.type === 'checkbox' ? !on : on ? '' : (f.on_state ?? ''))}
      >
        {on && (f.type === 'checkbox' ? <Icon.check size={Math.min(x1 - x0, h) * zoom * 0.9} strokeWidth={3} /> : <span className="dot" style={{ width: '50%', height: '50%', background: 'var(--ink)' }} />)}
      </button>
    )
  }
  const fontSize = Math.min(Math.max(h * 0.62, 7), 12) * zoom
  if (f.type === 'choice') {
    const options = groups.get(f.name)?.options ?? f.options
    return (
      <select
        aria-label={label}
        className={`f-input${claude}`}
        style={{ ...style, fontSize, padding: 0 }}
        value={String(value?.value ?? '')}
        onChange={(e) => onFieldChange(f.name, e.target.value)}
      >
        <option value="" />
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }
  const Tag = f.multiline || h > 34 ? 'textarea' : 'input'
  return (
    <Tag
      aria-label={label}
      title={label}
      className={`f-input${claude}`}
      style={{ ...style, fontSize }}
      value={String(value?.value ?? '')}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onFieldChange(f.name, e.target.value)}
    />
  )
}

function OverlayView(props: Props & { o: Overlay; isSelected: boolean; isEditing: boolean }) {
  const { o, zoom, page, isSelected, isEditing, marks, onSelect, onEdit, onChange, onRemove } = props
  const textRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean; wasSelected: boolean } | null>(null)

  // Entering edit mode: fill the editable box once and put the caret at the end.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!isEditing || !el) return
    el.textContent = o.text ?? ''
    const focus = () => {
      if (document.activeElement === el) return
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    focus()
    requestAnimationFrame(focus)
    // Only on entering edit mode; typing must not reset the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  // Dragging stops at the page's edges, so nothing ends up partly off the page.
  const clampX = (x: number) => Math.min(Math.max(x, 0), Math.max(0, page.width - Math.max(o.w, 4)))
  const clampY = (y: number) => Math.min(Math.max(y, 0), Math.max(0, page.height - Math.max(o.h, 4)))

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditing) return
    e.stopPropagation()
    commitOpenText()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: o.x, oy: o.y, moved: false, wasSelected: isSelected }
    onSelect(o.id)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) / zoom
    const dy = (e.clientY - d.py) / zoom
    if (!d.moved && Math.hypot(dx, dy) * zoom < 3) return
    d.moved = true
    onChange(o.id, { x: clampX(d.ox + dx), y: clampY(d.oy + dy) })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    // A plain click on text that was already selected starts editing.
    if (d && !d.moved && d.wasSelected && o.kind === 'text') onEdit(o.id)
  }

  const resizeDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, w: o.w, h: o.h }
    const el = e.currentTarget
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(Math.max(8, start.w + (ev.clientX - start.px) / zoom), page.width - o.x)
      onChange(o.id, { w, h: (w * start.h) / start.w })
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  const commitText = () => {
    const el = textRef.current
    if (!el) return
    const text = el.innerText.replace(/\n$/, '')
    onChange(o.id, {
      text,
      w: el.offsetWidth / zoom,
      h: el.offsetHeight / zoom,
      ...(text !== o.text ? { source: 'user' as const } : {}),
    })
    onEdit(null)
  }

  const scale = (f: number) =>
    o.kind === 'text'
      ? onChange(o.id, { fontSize: Math.min(Math.max((o.fontSize ?? 12) + (f > 1 ? 1 : -1), 6), 36) })
      : onChange(o.id, { w: o.w * f, h: o.h * f })

  const style: React.CSSProperties = { left: o.x * zoom, top: o.y * zoom }
  if (o.kind !== 'text') Object.assign(style, { width: o.w * zoom, height: o.h * zoom })
  const cls = `ov${isSelected && !isEditing ? ' selected' : ''}${o.source === 'claude' ? ' claude' : ''}`

  let body: React.ReactNode
  if (o.kind === 'text') {
    body = (
      <div
        ref={textRef}
        className="ov-text"
        style={{ fontSize: (o.fontSize ?? 12) * zoom }}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onBlur={isEditing ? commitText : undefined}
        onDoubleClick={() => onEdit(o.id)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLElement).blur()
          e.stopPropagation()
        }}
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      >
        {isEditing ? null : o.text}
      </div>
    )
  } else if (o.kind === 'image') {
    const mark = o.image ? marks[o.image] : null
    body = mark ? <img src={mark.url} alt={o.image === 'initials' ? 'Your initials' : 'Your signature'} draggable={false} /> : null
  } else {
    body = o.kind === 'check' ? <Icon.check strokeWidth={2.6} /> : <Icon.cross strokeWidth={2.6} />
  }

  return (
    <>
      <div
        className={cls}
        style={style}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        role="group"
        aria-label={o.label}
      >
        {o.source === 'claude' && o.kind === 'text' && !isEditing && (
          <span className="grip" aria-hidden="true">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
              {[2, 7, 12].flatMap((cy) => [<circle key={`a${cy}`} cx="2" cy={cy} r="1.2" />, <circle key={`b${cy}`} cx="6" cy={cy} r="1.2" />])}
            </svg>
          </span>
        )}
        {body}
        {isSelected && !isEditing && o.kind !== 'text' && <span className="handle" onPointerDown={resizeDown} aria-hidden="true" />}
      </div>
      {isSelected && !isEditing && (
        <div className="floatbar" style={{ left: o.x * zoom, top: o.y * zoom }} onPointerDown={(e) => e.stopPropagation()}>
          {o.kind === 'text' && (
            <button type="button" onClick={() => onEdit(o.id)}>
              Edit
            </button>
          )}
          <button type="button" onClick={() => scale(0.9)}>
            Smaller
          </button>
          <button type="button" onClick={() => scale(1.1)}>
            Larger
          </button>
          <button type="button" className="danger" onClick={() => onRemove(o.id)}>
            Delete
          </button>
        </div>
      )}
    </>
  )
}
