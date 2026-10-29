import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Editor } from './components/Editor'
import { Settings } from './components/Settings'
import { SignatureDialog, type DrawRequest } from './components/SignatureDialog'
import { StartScreen } from './components/StartScreen'
import type { Mark, MarkKind, OpenDoc, Status } from './types'

type View = 'start' | 'editor' | 'settings'

async function loadMarks(): Promise<Mark[]> {
  const { marks } = await api.marks()
  const loaded = await Promise.all(
    marks.map(async (m): Promise<Mark | null> => {
      const blob = await api.markImage(m.id)
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      // Wait for the size with onload: decode() can stall while the window is hidden.
      const img = new Image()
      await new Promise<void>((done) => {
        img.onload = img.onerror = () => done()
        setTimeout(done, 3000)
        img.src = url
      })
      const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : m.kind === 'signature' ? 3 : 1.5
      return { ...m, url, aspect }
    }),
  )
  return loaded.filter((m): m is Mark => m !== null)
}

export default function App() {
  const [view, setView] = useState<View>('start')
  const [status, setStatus] = useState<Status | null>(null)
  const [marks, setMarks] = useState<Mark[]>([])
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [drawing, setDrawing] = useState<DrawRequest | null>(null)
  const [opening, setOpening] = useState(false)
  const [toast, setToast] = useState('')
  const dirty = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const showToast = useCallback((m: string) => setToast(m), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status())
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e))
    }
  }, [showToast])

  const refreshMarks = useCallback(async () => {
    try {
      const next = await loadMarks()
      setMarks((old) => {
        old.forEach((m) => URL.revokeObjectURL(m.url))
        return next
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e))
    }
  }, [showToast])

  useEffect(() => {
    void refresh()
    void refreshMarks()
  }, [refresh, refreshMarks])

  const drawMark = useCallback((kind: MarkKind, mark?: Mark) => setDrawing({ kind, mark }), [])

  // Tell the server a window is still open, so a server started from the
  // Dock can stop itself once every window is closed.
  useEffect(() => {
    const t = setInterval(() => void api.ping().catch(() => {}), 60_000)
    return () => clearInterval(t)
  }, [])

  const chooseFile = useCallback(() => fileInput.current?.click(), [])

  const openFile = useCallback(
    async (file: File) => {
      if (dirty.current && !window.confirm('Open a new PDF? Your changes to this one will be lost.')) return
      setOpening(true)
      try {
        const opened = await api.open(file)
        dirty.current = false
        setDoc(opened)
        setView('editor')
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e))
      } finally {
        setOpening(false)
      }
    },
    [showToast],
  )

  // ⌘O / Ctrl+O opens a file from anywhere; leaving with unsaved work asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        chooseFile()
      }
    }
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [chooseFile])

  // Dropping a PDF anywhere opens it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) void openFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [openFile])

  // Done: close the PDF, forget it everywhere, and go back home.
  const closeDoc = useCallback(() => {
    if (!doc) return
    if (dirty.current && !window.confirm('Close this PDF without downloading? Your changes will be lost.')) return
    void api.close(doc.id).catch(() => {})
    dirty.current = false
    setDoc(null)
    setView('start')
  }, [doc])

  const onDirty = useCallback((d: boolean) => {
    dirty.current = d
  }, [])

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openFile(file)
        }}
      />

      {view === 'start' && (
        <StartScreen
          status={status}
          marks={marks}
          busy={opening}
          onFile={openFile}
          onChoose={chooseFile}
          onSettings={() => setView('settings')}
          onDrawMark={drawMark}
        />
      )}

      {doc && (
        <Editor
          key={doc.id}
          doc={doc}
          status={status}
          marks={marks}
          dateFormat={status?.settings.date_format ?? 'long'}
          hidden={view !== 'editor'}
          modalOpen={drawing !== null}
          onOpenPdf={chooseFile}
          onSettings={() => setView('settings')}
          onDrawMark={drawMark}
          onToast={showToast}
          onDirty={onDirty}
          onDone={closeDoc}
        />
      )}

      {view === 'settings' && (
        <Settings
          status={status}
          marks={marks}
          hasDoc={doc !== null}
          onBack={() => setView(doc ? 'editor' : 'start')}
          onOpenPdf={chooseFile}
          onDrawMark={drawMark}
          onMarksChange={refreshMarks}
          onSettingsChange={(settings) => setStatus((s) => (s ? { ...s, settings } : s))}
          onRefresh={refresh}
          onToast={showToast}
        />
      )}

      {drawing && (
        <SignatureDialog
          request={drawing}
          marks={marks}
          onClose={() => setDrawing(null)}
          onSaved={async () => {
            await refreshMarks()
            void refresh()
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
