// Shapes shared with the Python backend. All positions are PDF points with
// the origin at the top left of the page as displayed.

export type FieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'signature'

export interface PdfField {
  id: string
  name: string
  type: FieldType
  page: number
  rect: [number, number, number, number]
  label: string
  context: string
  value: string | boolean
  options: string[]
  on_state: string | null
  multiline: boolean
}

export interface PageInfo {
  width: number
  height: number
  has_text: boolean
}

export interface OpenDoc {
  id: string
  name: string
  pages: PageInfo[]
  fields: PdfField[]
  is_fillable: boolean
}

export type Source = 'user' | 'claude'
export type MarkKind = 'signature' | 'initials'

export interface FieldValue {
  value: string | boolean
  source: Source
}

export type OverlayKind = 'text' | 'image' | 'check' | 'cross'

export interface Overlay {
  id: string
  kind: OverlayKind
  page: number
  x: number
  y: number
  w: number
  h: number
  text?: string
  fontSize?: number
  /** For a signature or initials: the id of the saved one in the library. */
  image?: string
  source: Source
  /** What it is, for the side panel: "Signature", "Date", a matched label… */
  label: string
}

export type Tool = 'select' | 'text' | 'signature' | 'initials' | 'date' | 'check' | 'cross'

export type DateFormat = 'long' | 'iso' | 'dmy' | 'mdy'

export interface Settings {
  date_format: DateFormat
  send_images: boolean
}

export interface Status {
  profile: { path: string; exists: boolean; count: number }
  claude: { available: boolean }
  marks: Record<MarkKind, boolean>
  settings: Settings
}

export type AutofillResult =
  | { mode: 'fields'; values: Record<string, string | boolean>; missing: string[] }
  | {
      mode: 'scan'
      placements: { page: number; x: number; y: number; text: string; label: string; fontSize: number }[]
    }

/** A saved signature or set of initials, as the server lists it. */
export interface MarkInfo {
  id: string
  name: string
  kind: MarkKind
}

/** A saved one, loaded and ready to draw. */
export interface Mark extends MarkInfo {
  url: string
  /** width / height of the saved image */
  aspect: number
}

export interface ChatResult {
  reply: string
  values: Record<string, string | boolean>
  placements: { page: number; x: number; y: number; text: string; label: string; fontSize: number }[]
  edits: { id: string; text: string }[]
}
