import type { DateFormat } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(format: DateFormat, d = new Date()): string {
  const [y, m, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
  switch (format) {
    case 'iso':
      return `${y}-${pad(m)}-${pad(day)}`
    case 'dmy':
      return `${pad(day)}/${pad(m)}/${y}`
    case 'mdy':
      return `${pad(m)}/${pad(day)}/${y}`
    default:
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}

export const DATE_FORMATS: DateFormat[] = ['long', 'iso', 'dmy', 'mdy']
