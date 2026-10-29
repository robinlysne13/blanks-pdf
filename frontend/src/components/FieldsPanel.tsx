import { isFilled, overlayName, type FieldGroup } from '../model'
import type { FieldValue, Overlay } from '../types'

interface Props {
  groups: FieldGroup[]
  values: Record<string, FieldValue>
  missing: Set<string>
  overlays: Overlay[]
  selected: string | null
  isScan: boolean
  onFieldChange: (name: string, value: string | boolean) => void
  onPick: (o: Overlay) => void
}

export function FieldsPanel({ groups, values, missing, overlays, selected, isScan, onFieldChange, onPick }: Props) {
  const filled = groups.filter((g) => isFilled(values[g.name])).length
  // Fields Claude couldn't answer go first, so they get noticed.
  const ordered = [...groups].sort((a, b) => Number(missing.has(b.name) && !isFilled(values[b.name])) - Number(missing.has(a.name) && !isFilled(values[a.name])))
  const fromClaude = overlays.filter((o) => o.source === 'claude')
  const fromYou = overlays.filter((o) => o.source !== 'claude')

  return (
    <div className="panel-body">
      {groups.length > 0 && (
        <>
          <div className="panel-head">
            <h2>Form fields</h2>
            <span className="muted">
              {filled} of {groups.length} filled
            </span>
          </div>
          {ordered.map((g) => {
            const v = values[g.name]
            const claude = v?.source === 'claude'
            const gap = missing.has(g.name) && !isFilled(v)
            const chip = claude ? <span className="chip">Claude</span> : gap ? <span className="chip chip-warn">Not in profile</span> : null
            const id = `fp-${g.name}`
            if (g.type === 'checkbox') {
              return (
                <label key={g.name} className="check-row" title={g.label}>
                  <input type="checkbox" checked={v?.value === true} onChange={(e) => onFieldChange(g.name, e.target.checked)} />
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', flex: 1, overflowWrap: 'anywhere' }}>
                    {g.name}
                  </span>
                  {chip}
                </label>
              )
            }
            return (
              <div key={g.name} className="pin">
                <label htmlFor={id} title={g.label}>
                  <span>{g.name}</span>
                  {chip}
                </label>
                {g.type === 'text' ? (
                  <input
                    id={id}
                    type="text"
                    className={claude ? 'claude' : gap ? 'missing' : ''}
                    placeholder={gap ? 'Type it in' : g.label}
                    value={String(v?.value ?? '')}
                    onChange={(e) => onFieldChange(g.name, e.target.value)}
                  />
                ) : (
                  <select id={id} value={String(v?.value ?? '')} onChange={(e) => onFieldChange(g.name, e.target.value)}>
                    <option value="">—</option>
                    {g.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </>
      )}

      {fromClaude.length > 0 && (
        <OverlayList title="Placed by Claude" items={fromClaude} selected={selected} onPick={onPick} first={groups.length === 0} />
      )}
      {fromYou.length > 0 && <OverlayList title="Placed on page" items={fromYou} selected={selected} onPick={onPick} first={groups.length === 0 && fromClaude.length === 0} />}

      {groups.length === 0 && overlays.length === 0 && (
        <>
          <h2>{isScan ? 'A scanned form' : 'No form fields'}</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            This PDF has no fields to type into. Pick Text in the sidebar and click where you want to write, or let Claude place text for you.
          </p>
        </>
      )}

      {(groups.length > 0 || overlays.length > 0) && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          Editing a blue value turns it normal. Drag anything on the page to move it.
        </p>
      )}
    </div>
  )
}

function OverlayList({ title, items, selected, onPick, first }: { title: string; items: Overlay[]; selected: string | null; onPick: (o: Overlay) => void; first: boolean }) {
  return (
    <div className={first ? '' : 'divider'} style={first ? { display: 'flex', flexDirection: 'column', gap: 8 } : undefined}>
      {first ? (
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="muted">{items.length}</span>
        </div>
      ) : (
        <span className="cap">{title}</span>
      )}
      {items.map((o) => (
        <button key={o.id} type="button" className={`row-item${selected === o.id ? ' on' : ''}`} onClick={() => onPick(o)}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{overlayName(o)}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            p. {o.page + 1}
          </span>
        </button>
      ))}
    </div>
  )
}
