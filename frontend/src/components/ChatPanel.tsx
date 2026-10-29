import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  /** What Claude changed this turn, e.g. "Filled 2 fields". */
  summary?: string
  canUndo?: boolean
  undone?: boolean
}

interface Props {
  messages: ChatMsg[]
  busy: boolean
  ready: boolean
  isScan: boolean
  onSend: (text: string) => void
  onUndo: (id: string) => void
}

const EXAMPLES = ['My OHIP number is ', 'Here is an email with the details:\n\n', 'Tick 12 months for the term']

/** Talk to Claude about the open form: it fills fields from what you say,
 *  text you paste, and your profile. */
export function ChatPanel({ messages, busy, ready, isScan, onSend, onUndo }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  const send = () => {
    const text = draft.trim()
    if (!text || busy || !ready) return
    onSend(text)
    setDraft('')
  }

  const startWith = (text: string) => {
    setDraft(text)
    requestAnimationFrame(() => {
      const el = boxRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>
              Tell Claude what to fill, or paste an email or letter. It fills the form from what you say and your profile
              {isScan ? ', and places text on the page for you.' : '.'}
            </p>
            <div className="chat-examples">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="chip-btn" onClick={() => startWith(e)}>
                  {e.split('\n')[0].replace(/:$/, '…')}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble-${m.role}`}>
            <div className="bubble-text">{m.text}</div>
            {m.summary && (
              <div className="bubble-meta">
                <span className="chip">{m.undone ? 'Undone' : m.summary}</span>
                {m.canUndo && !m.undone && (
                  <button type="button" className="link-btn" style={{ color: 'var(--claude-ink)' }} onClick={() => onUndo(m.id)}>
                    Undo
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble bubble-assistant bubble-busy">
            <span className="spin" /> Claude is working on it…
          </div>
        )}
      </div>

      <div className="chat-compose">
        <textarea
          ref={boxRef}
          aria-label="Message to Claude"
          placeholder={ready ? 'Message Claude, or paste an email…' : 'Install Claude Code to chat'}
          value={draft}
          disabled={!ready}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="chat-compose-row">
          <span className="muted" style={{ fontSize: 12 }}>
            Enter to send · Shift+Enter for a new line
          </span>
          <button type="button" className="pill pill-red pill-sm" onClick={send} disabled={!draft.trim() || busy || !ready}>
            <Icon.sparkle size={15} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
