import type { FieldType, FieldValue, OpenDoc, Overlay, PdfField } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10)

/** One logical form field. Radio groups and repeated fields share a name
 *  across several widgets on the page. */
export interface FieldGroup {
  name: string
  type: Exclude<FieldType, 'signature'>
  label: string
  options: string[]
  widgets: PdfField[]
}

export function fieldGroups(doc: OpenDoc): FieldGroup[] {
  const groups = new Map<string, FieldGroup>()
  for (const f of doc.fields) {
    if (f.type === 'signature') continue
    let g = groups.get(f.name)
    if (!g) {
      g = { name: f.name, type: f.type, label: f.label || f.context.split(' | ')[0] || '', options: [], widgets: [] }
      groups.set(f.name, g)
    }
    g.widgets.push(f)
    if (f.type === 'radio' && f.on_state && !g.options.includes(f.on_state)) g.options.push(f.on_state)
    if (f.type === 'choice') g.options = f.options
  }
  return [...groups.values()]
}

export function initialValues(doc: OpenDoc): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const g of fieldGroups(doc)) {
    let value: string | boolean = ''
    if (g.type === 'checkbox') value = g.widgets.some((w) => w.value === true)
    else if (g.type === 'radio') value = g.widgets.find((w) => w.value === true)?.on_state ?? ''
    else value = String(g.widgets[0].value ?? '')
    out[g.name] = { value, source: 'user' }
  }
  return out
}

export const isFilled = (v: FieldValue | undefined) => !!v && v.value !== '' && v.value !== false

export function exportPayload(values: Record<string, FieldValue>, overlays: Overlay[]) {
  return {
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value])),
    overlays: overlays
      .filter((o) => o.kind !== 'text' || (o.text ?? '').trim() !== '')
      .map(({ kind, page, x, y, w, h, text, fontSize, image }) => ({ kind, page, x, y, w, h, text, fontSize, image })),
  }
}

export function overlayName(o: Overlay): string {
  if (o.kind === 'image') return o.label || 'Signature'
  if (o.kind === 'check') return 'Checkmark'
  if (o.kind === 'cross') return 'Cross'
  if (o.label && o.label !== 'Text') return o.label
  const t = (o.text ?? '').split('\n')[0]
  return t ? `“${t.length > 22 ? t.slice(0, 22) + '…' : t}”` : 'Text'
}
