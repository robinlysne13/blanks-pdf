import type { AutofillResult, ChatResult, MarkKind, OpenDoc, Settings, Status } from './types'

// Every API call carries this header. The server refuses calls without it,
// which keeps other websites from talking to Blanks on localhost.
const HEADERS = { 'X-Blanks': '1' }

export class ApiError extends Error {}

export interface ProfileRow {
  key: string
  value: string
  /** The placeholder text, for a detail not filled in yet. */
  hint: string
}

interface ProfilePayload {
  path: string
  exists: boolean
  rows: ProfileRow[]
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } })
  } catch {
    throw new ApiError("Can't reach Blanks. Is the server still running?")
  }
  if (!res.ok) {
    let detail = `Something went wrong (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail)
  }
  return res
}

const json = async <T,>(path: string, init?: RequestInit) => (await call(path, init)).json() as Promise<T>

export const api = {
  status: () => json<Status>('/api/status'),
  ping: () => call('/api/ping'),

  open(file: File) {
    const body = new FormData()
    body.append('file', file)
    return json<OpenDoc>('/api/documents', { method: 'POST', body })
  },

  async pageImage(docId: string, index: number, scale: number): Promise<string> {
    const res = await call(`/api/documents/${docId}/pages/${index}.png?scale=${scale}`)
    return URL.createObjectURL(await res.blob())
  },

  async export(docId: string, values: Record<string, unknown>, overlays: unknown[]): Promise<Blob> {
    const res = await call(`/api/documents/${docId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, overlays }),
    })
    return res.blob()
  },

  autofill: (docId: string) => json<AutofillResult>(`/api/documents/${docId}/autofill`, { method: 'POST' }),

  chat: (docId: string, body: { messages: { role: string; text: string }[]; values: Record<string, unknown>; overlays: unknown[] }) =>
    json<ChatResult>(`/api/documents/${docId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  async mark(kind: MarkKind): Promise<Blob | null> {
    try {
      return await (await call(`/api/marks/${kind}`)).blob()
    } catch {
      return null
    }
  },

  saveMark: (kind: MarkKind, png: Blob) => json(`/api/marks/${kind}`, { method: 'PUT', body: png }),

  profile: () => json<ProfilePayload>('/api/profile'),
  saveProfile: (rows: (ProfileRow & { was?: string })[]) =>
    json<ProfilePayload>('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),
  openProfile: () => json<{ path: string }>('/api/profile/open', { method: 'POST' }),

  saveSettings: (patch: Partial<Settings>) =>
    json<Settings>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
}
