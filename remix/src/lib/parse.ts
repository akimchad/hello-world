import type { DataSource, Field, FieldType, Role, Row, Table } from '../types'

export const uid = () => Math.random().toString(36).slice(2, 10)

/* ---------------- CSV ---------------- */

export function parseCSV(text: string): Row[] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      cur.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      cur.push(cell)
      cell = ''
      if (cur.some((x) => x.trim() !== '')) rows.push(cur)
      cur = []
    } else cell += c
  }
  cur.push(cell)
  if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  if (rows.length < 1) throw new Error('CSV file is empty')
  const header = rows[0].map((h, i) => h.trim() || `column_${i + 1}`)
  return rows.slice(1).map((r) => {
    const o: Row = {}
    header.forEach((h, i) => (o[h] = coerce(r[i] ?? '')))
    return o
  })
}

function coerce(v: string): unknown {
  const s = v.trim()
  if (s === '') return null
  if (/^(true|yes)$/i.test(s)) return true
  if (/^(false|no)$/i.test(s)) return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (s.includes(';') && !s.includes(' ') && s.split(';').length > 1) return s.split(';').filter(Boolean)
  return s
}

/* ---------------- JSON ---------------- */

function flatten(obj: Row, prefix = '', out: Row = {}, depth = 0): Row {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 1) flatten(v as Row, key, out, depth + 1)
    else if (Array.isArray(v)) out[key] = v.every((x) => typeof x !== 'object') ? v : v.length
    else out[key] = v
  }
  return out
}

const isObjArray = (v: unknown): v is Row[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))

export function parseJSON(text: string): { tables: { name: string; rows: Row[] }[]; profile?: Row } {
  const data = JSON.parse(text)
  if (isObjArray(data)) return { tables: [{ name: '', rows: data.map((r) => flatten(r)) }] }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const tables: { name: string; rows: Row[] }[] = []
    const profile: Row = {}
    for (const [k, v] of Object.entries(data as Row)) {
      if (isObjArray(v)) tables.push({ name: k, rows: v.map((r) => flatten(r)) })
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const vals = Object.values(v as Row)
        if (vals.length > 1 && vals.every((x) => x && typeof x === 'object' && !Array.isArray(x)))
          tables.push({ name: k, rows: Object.entries(v as Row).map(([key, r]) => flatten({ key, ...(r as Row) })) })
        else Object.assign(profile, flatten(v as Row, k))
      } else profile[k] = v
    }
    if (!tables.length) {
      // a single flat object: treat as one-row table so it can still be previewed
      tables.push({ name: '', rows: [flatten(data as Row)] })
    }
    return { tables, profile: Object.keys(profile).length ? profile : undefined }
  }
  throw new Error('JSON must be an array of records or an object containing arrays')
}

/* ---------------- Profiling ---------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?/

function inferType(values: unknown[]): FieldType {
  const v = values.filter((x) => x !== null && x !== undefined && x !== '')
  if (!v.length) return 'text'
  if (v.every((x) => Array.isArray(x))) return 'list'
  if (v.every((x) => typeof x === 'boolean')) return 'boolean'
  if (v.every((x) => typeof x === 'number' && isFinite(x))) return 'number'
  if (v.every((x) => typeof x === 'string' && DATE_RE.test(x) && !isNaN(Date.parse(x)))) return 'date'
  const strs = v.map(String)
  const distinct = new Set(strs).size
  const avgLen = strs.reduce((a, s) => a + s.length, 0) / strs.length
  if (avgLen < 28 && (distinct <= 12 || distinct <= v.length * 0.5)) return 'category'
  return 'text'
}

const has = (n: string, re: RegExp) => re.test(n.toLowerCase())

function inferRoles(name: string, type: FieldType, values: unknown[], distinct: number, rowCount: number): Role[] {
  const r: Role[] = []
  const n = name.toLowerCase().split('.').pop()!
  if (type === 'date' || has(n, /(date|due|deadline|updated|created|published|_at$|time)/)) if (type === 'date') r.push('date')
  if (type === 'boolean' && has(n, /(done|complete|finished|checked|closed)/)) r.push('done')
  else if (type === 'boolean') r.push('done')
  if (type === 'number' && has(n, /(progress|percent|completion|pct)/)) r.push('progress')
  else if (type === 'number') r.push('metric')
  if (type === 'category' || type === 'text') {
    if (has(n, /(status|state|stage)/)) r.push('status')
    if (has(n, /(lang|language|tech|stack)/)) r.push('language')
    if (has(n, /(priority|urgency)/)) r.push('priority')
    if (has(n, /(category|type|platform|course|subject|channel|genre|kind|project|repo|format|source)/) && distinct < rowCount) r.push('category')
    if (has(n, /(name|title|task|assignment|repo$|topic|item|label|headline|message)/)) r.push('name')
    if (has(n, /(desc|summary|notes|about|details|message)/)) r.push('description')
    if (has(n, /(url|link|href|website)/) || values.some((x) => typeof x === 'string' && /^https?:\/\//.test(x))) r.push('url')
  }
  if (type === 'list') r.push('tags')
  if (type === 'category' && !r.length && distinct <= 10) r.push('category')
  return r
}

export function profileRows(rows: Row[]): Field[] {
  const names: string[] = []
  for (const row of rows.slice(0, 200)) for (const k of Object.keys(row)) if (!names.includes(k)) names.push(k)
  const fields = names.map((name) => {
    const values = rows.map((r) => r[name])
    const type = inferType(values)
    const nonEmpty = values.filter((x) => x !== null && x !== undefined && x !== '')
    const distinct = new Set(nonEmpty.map((x) => JSON.stringify(x))).size
    return {
      name,
      type,
      distinct,
      samples: Array.from(new Set(nonEmpty.slice(0, 30).map((x) => (Array.isArray(x) ? x.join(', ') : String(x))))).slice(0, 4),
      roles: inferRoles(name, type, nonEmpty, distinct, rows.length),
    } as Field
  })
  // Ensure some field carries the "name" role: first unique-ish text/category field
  if (!fields.some((f) => f.roles.includes('name'))) {
    const cand = fields.find((f) => (f.type === 'text' || f.type === 'category') && f.distinct >= rows.length * 0.8 && !f.roles.includes('url'))
    if (cand) cand.roles.unshift('name')
  }
  // Long text fields without a role become descriptions
  for (const f of fields) if (f.type === 'text' && !f.roles.length) f.roles.push('description')
  return fields
}

export function buildSource(fileName: string, text: string, sample = false): DataSource {
  const id = uid()
  const ext = fileName.toLowerCase().split('.').pop()
  const base = fileName.replace(/\.[^.]+$/, '')
  let raw: { name: string; rows: Row[] }[]
  let profile: Row | undefined
  if (ext === 'csv') raw = [{ name: base, rows: parseCSV(text) }]
  else if (ext === 'json') {
    const p = parseJSON(text)
    raw = p.tables.map((t) => ({ ...t, name: t.name || base }))
    profile = p.profile
  } else throw new Error('Unsupported file type. Use .json or .csv')
  const tables: Table[] = raw
    .filter((t) => t.rows.length)
    .map((t) => ({ id: `${id}:${t.name}`, name: t.name, rows: t.rows, fields: profileRows(t.rows) }))
  if (!tables.length) throw new Error('No records found in file')
  return {
    id,
    fileName,
    size: new Blob([text]).size,
    format: ext as 'json' | 'csv',
    uploadedAt: Date.now(),
    sample,
    tables,
    profile,
  }
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export const humanize = (s: string) =>
  s
    .split('.')
    .pop()!
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
