import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Editor } from './components/Editor'
import { Settings } from './components/Settings'
import { SignatureDialog } from './components/SignatureDialog'
import { StartScreen } from './components/StartScreen'
import type { Mark, MarkKind, OpenDoc, Status } from './types'

type View = 'start' | 'editor' | 'settings'

async function loadMark(kind: MarkKind): Promise<Mark | null> {
  const blob = await api.mark(kind)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await img.decode().catch(() => {})
  return { url, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3 }
}

export default function App() {
  const [view, setView] = useState<View>('start')
  const [status, setStatus] = useState<Status | null>(null)
  const [marks, setMarks] = useState<Record<MarkKind, Mark | null>>({ signature: null, initials: null })
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [drawing, setDrawing] = useState<MarkKind | null>(null)
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

  const refreshMark = useCallback(async (kind: MarkKind) => {
    const mark = await loadMark(kind)
    setMarks((m) => {
      if (m[kind]) URL.revokeObjectURL(m[kind]!.url)
      return { ...m, [kind]: mark }
    })
  }, [])

  useEffect(() => {
    void refresh()
    void refreshMark('signature')
    void refreshMark('initials')
  }, [refresh, refreshMark])

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
          onDrawMark={setDrawing}
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
          onDrawMark={setDrawing}
          onToast={showToast}
          onDirty={onDirty}
        />
      )}

      {view === 'settings' && (
        <Settings
          status={status}
          marks={marks}
          hasDoc={doc !== null}
          onBack={() => setView(doc ? 'editor' : 'start')}
          onOpenPdf={chooseFile}
          onDrawMark={setDrawing}
          onSettingsChange={(settings) => setStatus((s) => (s ? { ...s, settings } : s))}
          onRefresh={refresh}
          onToast={showToast}
        />
      )}

      {drawing && (
        <SignatureDialog
          initialTab={drawing}
          marks={marks}
          onClose={() => setDrawing(null)}
          onSaved={async (kind) => {
            await refreshMark(kind)
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
