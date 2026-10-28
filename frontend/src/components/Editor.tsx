import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { formatDate } from '../dates'
import { Icon } from '../icons'
import { fieldGroups, initialValues, uid } from '../model'
import type { DateFormat, FieldValue, Mark, MarkKind, OpenDoc, Overlay, Status, Tool } from '../types'
import { DownloadDialog } from './DownloadDialog'
import { FieldsPanel } from './FieldsPanel'
import { PageView } from './PageView'
import { Sidebar } from './Sidebar'

const TOOLS: { id: Tool; label: string; key: string; icon: keyof typeof Icon }[] = [
  { id: 'select', label: 'Select', key: 'v', icon: 'select' },
  { id: 'text', label: 'Text', key: 't', icon: 'text' },
  { id: 'signature', label: 'Signature', key: 's', icon: 'signature' },
  { id: 'initials', label: 'Initials', key: 'i', icon: 'initials' },
  { id: 'date', label: "Today's date", key: 'd', icon: 'date' },
  { id: 'check', label: 'Checkmark', key: 'c', icon: 'check' },
  { id: 'cross', label: 'Cross', key: 'x', icon: 'cross' },
]
const MAX_PAGE_WIDTH = 880
const MARK_WIDTH: Record<MarkKind, number> = { signature: 150, initials: 54 }

type AutoState =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'error'; message: string }
  | { state: 'done'; message: string; undo: () => void }

interface Props {
  doc: OpenDoc
  status: Status | null
  marks: Record<MarkKind, Mark | null>
  dateFormat: DateFormat
  hidden: boolean
  modalOpen: boolean
  onOpenPdf: () => void
  onSettings: () => void
  onDrawMark: (kind: MarkKind) => void
  onToast: (message: string) => void
  onDirty: (dirty: boolean) => void
}

export function Editor({ doc, status, marks, dateFormat, hidden, modalOpen, onOpenPdf, onSettings, onDrawMark, onToast, onDirty }: Props) {
  const groups = useMemo(() => fieldGroups(doc), [doc])
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups])
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(doc))
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [pageIndex, setPageIndex] = useState(0)
  const [auto, setAuto] = useState<AutoState>({ state: 'idle' })
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [stageWidth, setStageWidth] = useState(MAX_PAGE_WIDTH)
  const [images, setImages] = useState<Record<string, string>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)

  const page = doc.pages[pageIndex]
  const zoom = Math.min(stageWidth, MAX_PAGE_WIDTH) / page.width
  const scale = Math.min(4, Math.max(1, Math.ceil(zoom * (window.devicePixelRatio || 1) * 2) / 2))
  const imageKey = `${pageIndex}@${scale}`

  const touch = useCallback(() => {
    if (!dirty.current) {
      dirty.current = true
      onDirty(true)
    }
  }, [onDirty])

  // Fit the page to the space it has.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setStageWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fetch the page image at a resolution that matches the zoom.
  useEffect(() => {
    if (images[imageKey]) return
    let gone = false
    api
      .pageImage(doc.id, pageIndex, scale)
      .then((url) => (gone ? URL.revokeObjectURL(url) : setImages((m) => ({ ...m, [imageKey]: url }))))
      .catch((e) => onToast(e.message))
    return () => {
      gone = true
    }
  }, [doc.id, pageIndex, scale, imageKey, images, onToast])

  const imagesRef = useRef(images)
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => () => Object.values(imagesRef.current).forEach((u) => URL.revokeObjectURL(u)), [])

  // ------------------------------------------------------------- editing

  const setField = (name: string, value: string | boolean) => {
    touch()
    setValues((v) => ({ ...v, [name]: { value, source: 'user' } }))
  }

  const add = (o: Omit<Overlay, 'id' | 'source'>, edit = false) => {
    const full: Overlay = { ...o, id: uid(), source: 'user' }
    touch()
    setOverlays((list) => [...list, full])
    setSelected(full.id)
    setEditing(edit ? full.id : null)
    setTool('select')
  }

  const change = useCallback(
    (id: string, patch: Partial<Overlay>) => {
      touch()
      setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    },
    [touch],
  )

  const remove = useCallback((id: string) => {
    setOverlays((list) => list.filter((o) => o.id !== id))
    setSelected((s) => (s === id ? null : s))
    setEditing((s) => (s === id ? null : s))
  }, [])

  // Stopping an edit drops text boxes left empty.
  const stopEditing = useCallback((id: string | null) => {
    setEditing((current) => {
      if (current && current !== id) {
        setOverlays((list) => list.filter((o) => o.id !== current || (o.text ?? '').trim() !== ''))
      }
      return id
    })
  }, [])

  const placeMark = (kind: MarkKind, cx: number, cy: number, fitW?: number, fitH?: number) => {
    const mark = marks[kind]
    if (!mark) {
      onDrawMark(kind)
      return
    }
    let w = MARK_WIDTH[kind]
    let h = w / mark.aspect
    if (fitW && fitH) {
      const s = Math.min(fitW / w, (fitH * 1.6) / h)
      w *= s
      h *= s
    }
    add({ kind: 'image', image: kind, page: pageIndex, x: cx - w / 2, y: cy - h * 0.7, w, h, label: kind === 'signature' ? 'Signature' : 'Initials' })
  }

  const place = (x: number, y: number) => {
    switch (tool) {
      case 'text':
        add({ kind: 'text', page: pageIndex, x, y: y - 12 * 0.6, w: 4, h: 14.4, text: '', fontSize: 12, label: 'Text' }, true)
        break
      case 'date':
        add({ kind: 'text', page: pageIndex, x, y: y - 11 * 0.6, w: 70, h: 13.2, text: formatDate(dateFormat), fontSize: 11, label: 'Date' })
        break
      case 'signature':
      case 'initials':
        placeMark(tool, x, y)
        break
      case 'check':
      case 'cross':
        add({ kind: tool, page: pageIndex, x: x - 7, y: y - 7, w: 14, h: 14, label: tool === 'check' ? 'Checkmark' : 'Cross' })
        break
    }
  }

  // ---------------------------------------------------------- auto-fill

  const runAutofill = async () => {
    setAuto({ state: 'running' })
    try {
      const r = await api.autofill(doc.id)
      touch()
      if (r.mode === 'fields') {
        const names = Object.keys(r.values)
        let before: Record<string, FieldValue> = {}
        setValues((v) => {
          before = v
          const next = { ...v }
          for (const [k, val] of Object.entries(r.values)) next[k] = { value: val, source: 'claude' }
          return next
        })
        setMissing(new Set(r.missing))
        const gaps = r.missing.length
        setAuto({
          state: 'done',
          message:
            names.length === 0
              ? "Claude didn't find anything in your profile that fits this form."
              : `Claude filled ${names.length} of ${groups.length} fields from your profile.${gaps ? ` ${gaps === 1 ? "One wasn't" : `${gaps} weren't`} in it.` : ''} Blue values are Claude's. Check them before you download.`,
          undo: () =>
            setValues((v) => {
              const next = { ...v }
              for (const k of names) if (next[k]?.source === 'claude') next[k] = before[k]
              return next
            }),
        })
      } else {
        const added: Overlay[] = r.placements.map((p) => ({
          id: uid(),
          kind: 'text',
          page: p.page,
          x: p.x,
          y: p.y,
          w: p.text.length * p.fontSize * 0.5,
          h: p.fontSize * 1.2,
          text: p.text,
          fontSize: p.fontSize,
          source: 'claude',
          label: p.label || 'Text',
        }))
        const ids = new Set(added.map((o) => o.id))
        setOverlays((list) => [...list, ...added])
        if (added.length && !added.some((o) => o.page === pageIndex)) setPageIndex(added[0].page)
        setAuto({
          state: 'done',
          message: added.length
            ? `This PDF has no form fields. Claude placed ${added.length} text ${added.length === 1 ? 'box' : 'boxes'} next to the labels it found. Drag any that sit wrong.`
            : "Claude didn't find anything on this form it could fill from your profile.",
          undo: () => setOverlays((list) => list.filter((o) => !ids.has(o.id) || o.source !== 'claude')),
        })
      }
    } catch (e) {
      setAuto({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  // ----------------------------------------------------------- keyboard

  useEffect(() => {
    if (hidden || modalOpen || downloading) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      const sel = overlays.find((o) => o.id === selected)
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        remove(sel.id)
      } else if (e.key === 'Escape') {
        setSelected(null)
        setTool('select')
      } else if (e.key === 'Enter' && sel?.kind === 'text') {
        e.preventDefault()
        stopEditing(sel.id)
      } else if (e.key.startsWith('Arrow') && sel) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0]
        change(sel.id, { x: sel.x + d[0], y: sel.y + d[1] })
      } else {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
        if (t) setTool(t.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden, modalOpen, downloading, overlays, selected, remove, change, stopEditing])

  const pick = (o: Overlay) => {
    setPageIndex(o.page)
    setSelected(o.id)
    setEditing(null)
  }

  const showClaude = () => {
    setDownloading(false)
    const first = overlays.find((o) => o.source === 'claude')
    if (first) pick(first)
    else document.querySelector<HTMLInputElement>('.panel input.claude')?.focus()
  }

  const pageFields = doc.fields.filter((f) => f.page === pageIndex)
  const pageOverlays = overlays.filter((o) => o.page === pageIndex)
  const claudeReady = status?.claude.available ?? false
  const kind = doc.is_fillable ? 'fillable form' : doc.pages.some((p) => p.has_text) ? 'no form fields' : 'scanned, no fields'

  return (
    <div className="app" style={hidden ? { display: 'none' } : undefined}>
      <Sidebar onOpenPdf={onOpenPdf} onSettings={onSettings}>
        <nav className="nav-list" aria-label="Tools">
          <div className="cap">Tools</div>
          {TOOLS.map((t) => {
            const I = Icon[t.icon]
            return (
              <button key={t.id} className="nav" type="button" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
                <I style={tool === t.id ? { color: 'var(--red)' } : undefined} />
                <span className="grow">{t.label}</span>
                <span className="hint">{t.key.toUpperCase()}</span>
              </button>
            )
          })}
        </nav>
        {(['signature', 'initials'] as const).map((k) => (
          <div key={k} className="glass" style={{ borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="cap">Your {k}</span>
            {marks[k] ? <img src={marks[k]!.url} alt={`Your saved ${k}`} style={{ height: k === 'signature' ? 40 : 30, objectFit: 'contain', objectPosition: 'left' }} /> : <span className="muted">Not drawn yet</span>}
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onDrawMark(k)}>
              {marks[k] ? 'Redraw' : 'Draw it'}
            </button>
          </div>
        ))}
      </Sidebar>

      <div className="main">
        <header className="topbar glass">
          <span className="name" title={doc.name}>
            {doc.name}
          </span>
          <span className="muted">
            {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} · {kind}
          </span>
          <div className="spacer" />
          <button
            className="pill pill-glass"
            type="button"
            onClick={runAutofill}
            disabled={auto.state === 'running' || !claudeReady}
            title={claudeReady ? 'Fill what your profile answers' : 'Install and sign in to Claude Code to use auto-fill'}
          >
            {auto.state === 'running' ? <span className="spin" /> : <Icon.sparkle size={17} />}
            {auto.state === 'running' ? 'Claude is reading…' : 'Auto-fill with Claude'}
          </button>
          <button className="pill pill-red" type="button" onClick={() => setDownloading(true)}>
            <Icon.download size={17} />
            Download
          </button>
        </header>

        {auto.state === 'running' && (
          <div className="banner banner-claude" role="status">
            <span className="spin" />
            <span className="text">Claude is reading the form and your profile. This usually takes 10 to 30 seconds.</span>
          </div>
        )}
        {auto.state === 'done' && (
          <div className="banner banner-claude" role="status">
            <Icon.sparkle />
            <span className="text">{auto.message}</span>
            <button
              className="pill pill-sm"
              type="button"
              style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--claude-ink)' }}
              onClick={() => {
                auto.undo()
                setMissing(new Set())
                setAuto({ state: 'idle' })
              }}
            >
              Undo auto-fill
            </button>
            <button className="pill pill-sm" type="button" style={{ background: 'transparent', color: 'var(--claude-ink)' }} onClick={() => setAuto({ state: 'idle' })} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {auto.state === 'error' && (
          <div className="banner banner-error" role="alert">
            <span className="text">{auto.message}</span>
            <button className="pill pill-sm pill-glass" type="button" onClick={() => setAuto({ state: 'idle' })}>
              OK
            </button>
          </div>
        )}

        <div className="workspace">
          <div className="stage" ref={stageRef}>
            <div className="page-frame">
              <PageView
                page={page}
                image={images[imageKey] ?? Object.entries(images).find(([k]) => k.startsWith(`${pageIndex}@`))?.[1] ?? null}
                zoom={zoom}
                tool={tool}
                fields={pageFields}
                groups={groupMap}
                values={values}
                overlays={pageOverlays}
                marks={marks}
                selected={selected}
                editing={editing}
                onPlace={place}
                onSignIn={([x0, y0, x1, y1]) => placeMark('signature', (x0 + x1) / 2, y0 + (y1 - y0) * 0.7, x1 - x0, y1 - y0)}
                onBackground={() => {
                  setSelected(null)
                  stopEditing(null)
                }}
                onFieldChange={setField}
                onSelect={(id) => {
                  setSelected(id)
                  if (editing !== id) stopEditing(null)
                }}
                onEdit={stopEditing}
                onChange={change}
                onRemove={remove}
              />
            </div>
            {doc.pages.length > 1 && (
              <div className="pager glass">
                <button type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex((i) => i - 1)}>
                  <Icon.left size={16} />
                </button>
                <span style={{ padding: '0 6px' }}>
                  Page {pageIndex + 1} of {doc.pages.length}
                </span>
                <button type="button" aria-label="Next page" disabled={pageIndex === doc.pages.length - 1} onClick={() => setPageIndex((i) => i + 1)}>
                  <Icon.right size={16} />
                </button>
              </div>
            )}
          </div>

          <FieldsPanel
            groups={groups}
            values={values}
            missing={missing}
            overlays={overlays}
            selected={selected}
            isScan={!doc.pages.some((p) => p.has_text)}
            onFieldChange={setField}
            onPick={pick}
          />
        </div>
      </div>

      {downloading && (
        <DownloadDialog
          doc={doc}
          values={values}
          overlays={overlays}
          onClose={() => setDownloading(false)}
          onShowClaude={showClaude}
          onDone={(name) => {
            setDownloading(false)
            dirty.current = false
            onDirty(false)
            onToast(`Saved ${name}`)
          }}
        />
      )}
    </div>
  )
}
