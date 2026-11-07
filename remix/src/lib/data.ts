import type { Row, Table, Widget } from '../types'

export type IRow = Row & { __i: number }

const DONE_RE = /^(done|complete|completed|published|shipped|submitted|graded|closed|finished|yes|true)$/i
const POSITIVE_RE = /^(active|done|complete|completed|published|shipped|submitted|graded|in progress|live|open)$/i

export const isDone = (v: unknown) => v === true || (typeof v === 'string' && DONE_RE.test(v.trim()))
export const isPositive = (v: string) => POSITIVE_RE.test(v.trim())

export function rowsWithOverrides(table: Table, overrides: Record<string, boolean>): IRow[] {
  const prefix = `${table.id}#`
  const ov = Object.entries(overrides).filter(([k]) => k.startsWith(prefix))
  const rows: IRow[] = table.rows.map((r, i) => ({ ...r, __i: i }))
  for (const [k, v] of ov) {
    const [, idx, field] = k.slice(table.id.length).split('#')
    const row = rows[Number(idx)]
    if (row) row[field] = v
  }
  return rows
}

export const str = (v: unknown): string =>
  v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function matchesSearch(row: Row, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  return Object.entries(row).some(([k, v]) => k !== '__i' && str(v).toLowerCase().includes(needle))
}

export function groupBy(rows: Row[], field: string, valueField?: string, agg: 'count' | 'sum' | 'avg' = 'count') {
  const m = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    const raw = r[field]
    const keys = Array.isArray(raw) ? raw.map(String) : [str(raw) || '—']
    for (const k of keys) {
      const e = m.get(k) ?? { sum: 0, n: 0 }
      e.n++
      if (valueField) e.sum += Number(r[valueField]) || 0
      m.set(k, e)
    }
  }
  return [...m.entries()]
    .map(([name, e]) => ({ name, value: valueField && agg !== 'count' ? (agg === 'avg' ? e.sum / e.n : e.sum) : e.n }))
    .sort((a, b) => b.value - a.value)
}

export function timeSeries(rows: Row[], dateField: string, valueField?: string) {
  const dates = rows.map((r) => Date.parse(str(r[dateField]))).filter((d) => !isNaN(d))
  if (!dates.length) return []
  const min = Math.min(...dates)
  const max = Math.max(...dates)
  const spanDays = (max - min) / 864e5
  const bucket = spanDays > 120 ? 'month' : spanDays > 45 ? 'week' : 'day'
  const keyOf = (t: number) => {
    const d = new Date(t)
    if (bucket === 'month') return d.toISOString().slice(0, 7)
    if (bucket === 'week') {
      const s = new Date(d)
      s.setUTCDate(d.getUTCDate() - d.getUTCDay())
      return s.toISOString().slice(0, 10)
    }
    return d.toISOString().slice(0, 10)
  }
  const m = new Map<string, number>()
  // seed continuous buckets so the chart doesn't skip empty days
  if (bucket === 'day' && spanDays <= 60) for (let t = min; t <= max; t += 864e5) m.set(keyOf(t), 0)
  for (const r of rows) {
    const t = Date.parse(str(r[dateField]))
    if (isNaN(t)) continue
    const k = keyOf(t)
    m.set(k, (m.get(k) ?? 0) + (valueField ? Number(r[valueField]) || 0 : 1))
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, value]) => ({
      name: bucket === 'month' ? k : new Date(k + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value,
    }))
}

export function statValue(rows: Row[], w: Widget): { value: number; of?: number; display: string } {
  const f = w.field
  let value = rows.length
  let of: number | undefined
  switch (w.agg) {
    case 'sum':
      value = f ? rows.reduce((a, r) => a + (Number(r[f]) || 0), 0) : rows.length
      break
    case 'avg': {
      const vals = f ? rows.map((r) => r[f]).filter((v) => v !== null && v !== '' && v !== undefined).map(Number).filter(isFinite) : []
      value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      break
    }
    case 'distinct':
      value = f ? new Set(rows.flatMap((r) => (Array.isArray(r[f]) ? (r[f] as unknown[]).map(String) : [str(r[f])])).filter(Boolean)).size : 0
      break
    case 'countWhere':
      of = rows.length
      value = f
        ? rows.filter((r) => (w.equals !== undefined && w.equals !== '' ? str(r[f]).toLowerCase() === w.equals.toLowerCase() : isDone(r[f]))).length
        : 0
      break
  }
  return { value, of, display: formatNumber(value, w.agg === 'avg') }
}

export function formatNumber(n: number, decimals = false) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  if (decimals) return n.toFixed(1).replace(/\.0$/, '')
  return Math.round(n).toLocaleString()
}

/** Parse a date; plain YYYY-MM-DD is a calendar day in the viewer's timezone (not UTC midnight). */
export function parseDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(s)
}

export function relativeDate(s: string) {
  const t = parseDate(s)
  if (isNaN(t)) return s
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0 && diff > -14) return `${-diff}d ago`
  if (diff > 0 && diff < 14) return `in ${diff}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
