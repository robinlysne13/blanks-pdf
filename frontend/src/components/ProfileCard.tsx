import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ProfileRow } from '../api'
import { uid } from '../model'

interface Row extends ProfileRow {
  id: string
  /** The key as last saved, so a rename edits the same line in the file. */
  was: string
}

type SaveState = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string }

const SAVE_DELAY = 500

interface Props {
  onSaved: () => void
}

/** The profile, edited in place. Every change saves itself shortly after
 *  typing stops; values stay hidden until "Show values". */
export function ProfileCard({ onSaved }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [path, setPath] = useState('')
  const [reveal, setReveal] = useState(false)
  const [save, setSave] = useState<SaveState>({ state: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef(false)
  const latest = useRef<Row[]>([])
  const focusId = useRef<string | null>(null)
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  const load = useCallback(async () => {
    if (pending.current) return // never overwrite edits that haven't saved yet
    try {
      const p = await api.profile()
      setPath(p.path)
      const next = p.rows.map((r) => ({ ...r, id: uid(), was: r.key }))
      latest.current = next
      setRows(next)
    } catch (e) {
      setSave({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const flush = useCallback(async () => {
    timer.current = null
    const snapshot = latest.current
    setSave({ state: 'saving' })
    try {
      await api.saveProfile(snapshot.map(({ key, value, hint, was }) => ({ key, value, hint, was })))
      // The saved keys are now what the file holds.
      const saved = new Map(snapshot.map((r) => [r.id, r.key]))
      latest.current = latest.current.map((r) => (saved.has(r.id) ? { ...r, was: saved.get(r.id)! } : r))
      setRows(latest.current)
      if (!timer.current) pending.current = false
      setSave({ state: 'saved' })
      onSavedRef.current()
    } catch (e) {
      setSave({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const schedule = (next: Row[]) => {
    latest.current = next
    setRows(next)
    pending.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DELAY)
  }

  useEffect(() => {
    void load()
    // Pick up edits made to the file elsewhere when the window comes back.
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Leaving Settings mid-typing still saves.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        void flush()
      }
    },
    [flush],
  )

  const update = (id: string, patch: Partial<Row>) => schedule(latest.current.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => schedule(latest.current.filter((r) => r.id !== id))
  const add = () => {
    const row: Row = { id: uid(), key: '', value: '', hint: '', was: '' }
    focusId.current = row.id
    latest.current = [...latest.current, row]
    setRows(latest.current)
    setReveal(true) // a new detail is easier to type when you can see it
  }

  const openFile = async () => {
    try {
      await api.openProfile()
    } catch (e) {
      setSave({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const filled = rows?.filter((r) => r.key && r.value).length ?? 0
  const status =
    save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved' : save.state === 'error' ? `Couldn't save: ${save.message}` : `${filled} filled`

  return (
    <section id="profile" className="card glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2>Profile</h2>
        <span className="muted" role="status" aria-live="polite" style={save.state === 'error' ? { color: 'var(--warn-ink)' } : undefined}>
          {save.state === 'saved' && <span style={{ color: 'var(--good)' }}>✓ </span>}
          {status}
        </span>
      </div>
      <p>What Claude may use to fill forms. Changes save as you type, to a file on this computer that never enters the repo.</p>

      {rows === null ? (
        <span className="muted">Loading…</span>
      ) : (
        <div className="profile-rows">
          {rows.map((r) => (
            <div key={r.id} className="profile-row">
              <input
                className="profile-key mono"
                aria-label="Detail name"
                placeholder="label"
                value={r.key}
                ref={(el) => {
                  if (el && focusId.current === r.id) {
                    focusId.current = null
                    el.focus()
                  }
                }}
                onChange={(e) => update(r.id, { key: e.target.value })}
              />
              <input
                className={`profile-value${reveal ? '' : ' masked'}`}
                aria-label={r.key || 'Value'}
                placeholder={r.hint || 'value'}
                value={r.value}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => update(r.id, { value: e.target.value })}
              />
              <button type="button" className="row-remove" aria-label={`Remove ${r.key || 'this detail'}`} onClick={() => remove(r.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <button type="button" className="pill pill-glass pill-sm" onClick={add}>
          + Add a detail
        </button>
        <button type="button" className="link-btn" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
          {reveal ? 'Hide values' : 'Show values'}
        </button>
        <div className="spacer" />
        <button type="button" className="link-btn" onClick={openFile} title={path}>
          Open the file
        </button>
      </div>
    </section>
  )
}
