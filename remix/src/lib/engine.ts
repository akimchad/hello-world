// REMIX generation engine.
// - generateLocal(): deterministic, rule-based generator that reads the real data profile + prompt.
// - sanitizeSpec(): validates any spec (e.g. from Claude) against the supported widget catalog and the
//   actual fields in the user's data. Nothing returned by the model is ever executed — only rendered
//   through known React components.

import type { AppSpec, Archetype, DataSource, Field, Role, Table, Widget, WidgetType } from '../types'
import { WIDGET_TYPES } from '../types'
import { humanize, uid } from './parse'
import { isPositive } from './data'

export const ACCENTS: Record<Archetype, string> = {
  developer: '#d4f56a',
  student: '#7cc4ff',
  creator: '#ff9b73',
  generic: '#b9a3ff',
}
export const ACCENT_OPTIONS = ['#d4f56a', '#7cc4ff', '#ff9b73', '#b9a3ff', '#f2f2f2']

const DEFAULT_TITLES: Record<Archetype, string> = {
  developer: 'Developer Command Center',
  student: 'Study Planner',
  creator: 'Creator Studio',
  generic: '',
}

export function detectArchetype(prompt: string, tables: Table[]): Archetype {
  const p = prompt.toLowerCase()
  const fieldText = tables.flatMap((t) => [t.name, ...t.fields.map((f) => f.name)]).join(' ').toLowerCase()
  const score = (re: RegExp) => (p.match(re)?.length ?? 0) * 3 + (fieldText.match(re)?.length ?? 0)
  const s = {
    developer: score(/developer|github|code|coding|repo|commit|programming|engineer|language|stars/g),
    student: score(/study|student|assignment|course|class|exam|homework|grade|school|lecture/g),
    creator: score(/creator|content|youtube|instagram|tiktok|post|video|audience|views|likes|platform/g),
  }
  const best = (Object.entries(s) as [Archetype, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : 'generic'
}

const pick = (fields: Field[], role: Role, exclude: (string | undefined)[] = []) =>
  fields.find((f) => f.roles.includes(role) && !exclude.includes(f.name))

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(ies)$/, 'y').replace(/s$/, ''))

interface Profile {
  t: Table
  name?: Field
  status?: Field
  lang?: Field
  cat?: Field
  date?: Field
  progress?: Field
  done?: Field
  desc?: Field
  tags?: Field
  priority?: Field
  metrics: Field[]
  kind: 'entities' | 'events' | 'tasks' | 'goals'
  relevance: number
}

function profileTable(t: Table, promptTokens: string[]): Profile {
  const f = t.fields
  const name = f.find((x) => x.roles.includes('name') && /^(name|title)$/i.test(x.name)) ?? pick(f, 'name')
  const status = pick(f, 'status')
  const lang = pick(f, 'language')
  const cat = pick(f, 'category', [name?.name, status?.name, lang?.name])
  const date = pick(f, 'date')
  const progress = pick(f, 'progress')
  const done = pick(f, 'done')
  const desc = pick(f, 'description', [name?.name])
  const tags = pick(f, 'tags')
  const priority = pick(f, 'priority')
  const metrics = f.filter((x) => x.roles.includes('metric'))
  const n = t.rows.length
  const tn = t.name.toLowerCase()
  let kind: Profile['kind'] = 'entities'
  if (done || /task|todo|assignment|homework/.test(tn)) kind = 'tasks'
  else if (date && n >= 8 && (!name || name.distinct < n * 0.7 || /activity|event|log|history|commit/.test(tn))) kind = 'events'
  else if (progress && !status && n <= 15) kind = 'goals'
  const words = new Set(tokens([t.name, ...f.map((x) => x.name)].join(' ')))
  const relevance = promptTokens.filter((w) => words.has(w)).length
  return { t, name, status, lang, cat, date, progress, done, desc, tags, priority, metrics, kind, relevance }
}

function bestMetric(p: Profile) {
  const pref = /stars|views|revenue|amount|score|grade|likes|commits|hours|count/i
  return p.metrics.find((m) => pref.test(m.name) && !p.progress?.name.includes(m.name)) ?? p.metrics.find((m) => m !== p.progress)
}

function positiveValue(t: Table, field: string) {
  const counts = new Map<string, number>()
  for (const r of t.rows) {
    const v = String(r[field] ?? '')
    if (isPositive(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

const W = (w: Omit<Widget, 'id' | 'visible'> & { visible?: boolean }): Widget => ({ id: uid(), visible: true, ...w })

export function generateLocal(prompt: string, sources: DataSource[]): AppSpec {
  const tables = sources.flatMap((s) => s.tables).filter((t) => t.rows.length > 1)
  const pt = tokens(prompt)
  const p = prompt.toLowerCase()
  const archetype = detectArchetype(prompt, tables)
  const want = {
    lang: /language|stack|tech/.test(p),
    activity: /activity|recent|timeline|history|commit|feed/.test(p),
    trend: /over time|trend|history|per day|per week|daily|weekly|monthly|growth/.test(p),
    progress: /progress|goal|learning|track|completion/.test(p),
    tasks: /task|todo|to-do|assignment|checklist|deadline|completed|homework|to do/.test(p),
    status: /status|pipeline|stage|state/.test(p),
    perf: /performance|views|metric|stat|best|top|analytics|grade|score/.test(p),
    schedule: /schedule|calendar|deadline|upcoming|due|publish/.test(p),
    table: /table|spreadsheet|list|everything|all/.test(p),
  }
  const reasoning: string[] = []
  const totalRows = tables.reduce((a, t) => a + t.rows.length, 0)
  reasoning.push(`Read ${tables.length} table${tables.length === 1 ? '' : 's'} with ${totalRows} records from ${sources.map((s) => s.fileName).join(', ')}.`)

  const profiles = tables.map((t) => profileTable(t, pt)).sort((a, b) => b.relevance - a.relevance || b.t.rows.length - a.t.rows.length)
  // Primary table: the most relevant "entities" table, else most relevant overall.
  const primary =
    profiles.find((x) => x.kind === 'entities' && x.name && x.relevance > 0) ??
    profiles.find((x) => x.kind === 'entities' && x.name) ??
    profiles.find((x) => x.name) ??
    profiles[0]

  const stats: Widget[] = []
  const charts: Widget[] = []
  const lists: Widget[] = []
  const extras: Widget[] = []

  for (const pr of profiles) {
    const { t } = pr
    const label = humanize(t.name)
    const isPrimary = pr === primary
    const relevant = isPrimary || pr.relevance > 0
    const vis = (b: boolean) => relevant && b
    reasoning.push(
      `\`${t.name}\` → ${pr.kind} (${t.rows.length} rows)` +
        [pr.name && ` · title: ${pr.name.name}`, pr.status && ` · status: ${pr.status.name}`, pr.lang && ` · language: ${pr.lang.name}`, pr.date && ` · date: ${pr.date.name}`, pr.metrics.length && ` · metrics: ${pr.metrics.map((m) => m.name).join(', ')}`]
          .filter(Boolean)
          .join(''),
    )

    if (pr.kind === 'entities') {
      stats.push(W({ type: 'stat', title: `Total ${label.toLowerCase()}`, table: t.id, size: 1, agg: 'count', visible: relevant }))
      const m = bestMetric(pr)
      if (m) stats.push(W({ type: 'stat', title: `Total ${humanize(m.name).toLowerCase()}`, table: t.id, size: 1, agg: 'sum', field: m.name, visible: vis(true) }))
      if (pr.lang) stats.push(W({ type: 'stat', title: humanize(pr.lang.name) + 's', table: t.id, size: 1, agg: 'distinct', field: pr.lang.name, visible: vis(true) }))
      if (pr.status) {
        const pos = positiveValue(t, pr.status.name)
        if (pos) stats.push(W({ type: 'stat', title: pos, table: t.id, size: 1, agg: 'countWhere', field: pr.status.name, equals: pos, visible: vis(true) }))
      }
      if (pr.lang)
        charts.push(W({ type: 'bar', title: `${humanize(pr.lang.name)}s`, table: t.id, size: 2, field: pr.lang.name, visible: vis(true), hint: `${label} per ${humanize(pr.lang.name).toLowerCase()}` }))
      if (pr.cat && m)
        charts.push(W({ type: 'bar', title: `${humanize(m.name)} by ${humanize(pr.cat.name).toLowerCase()}`, table: t.id, size: 2, field: pr.cat.name, valueField: m.name, agg: 'sum', visible: vis(true) }))
      else if (pr.cat) charts.push(W({ type: 'bar', title: `By ${humanize(pr.cat.name).toLowerCase()}`, table: t.id, size: 2, field: pr.cat.name, visible: vis(!pr.lang) }))
      if (pr.status) charts.push(W({ type: 'donut', title: `${label} status`, table: t.id, size: 2, field: pr.status.name, visible: vis(true) }))
      if (pr.date && m && /publish|post|content|video/.test(t.name + p))
        charts.push(W({ type: 'area', title: `${humanize(m.name)} over time`, table: t.id, size: 2, dateField: pr.date.name, valueField: m.name, visible: vis(want.perf) }))
      if (pr.date && pr.name)
        extras.push(W({ type: 'timeline', title: want.schedule ? 'Schedule' : `Recently updated`, table: t.id, size: 2, dateField: pr.date.name, titleField: pr.name.name, subtitleField: pr.cat?.name ?? pr.lang?.name, badgeField: pr.status?.name, visible: vis(want.schedule) }))
      if (pr.name)
        lists.push(
          W({
            type: 'cards',
            title: label,
            table: t.id,
            size: 4,
            titleField: pr.name.name,
            subtitleField: pr.desc?.name,
            badgeField: pr.status?.name,
            tagField: pr.lang?.name ?? pr.cat?.name,
            metricField: m?.name,
            progressField: pr.progress?.name,
            visible: relevant,
          }),
        )
      if (pr.progress && pr.name)
        extras.push(W({ type: 'progress', title: `${label} progress`, table: t.id, size: 2, progressField: pr.progress.name, titleField: pr.name.name, visible: vis(want.progress) }))
      lists.push(W({ type: 'table', title: `All ${label.toLowerCase()}`, table: t.id, size: 4, columns: t.fields.slice(0, 7).map((f) => f.name), visible: vis(want.table && !pr.name) || (relevant && !pr.name) }))
    }

    if (pr.kind === 'events') {
      if (pr.date) {
        charts.unshift(W({ type: 'area', title: `${label} over time`, table: t.id, size: 2, dateField: pr.date.name, visible: relevant || want.activity, hint: `${t.rows.length} events` }))
        const msg =
          t.fields.find((f) => /^(message|title|summary|description|event|text)$/i.test(f.name)) ?? pr.desc ?? pr.name ?? t.fields.find((f) => f.type === 'text' || f.type === 'category')
        const badge = t.fields.find((f) => /type|kind|action/i.test(f.name) && f !== msg)
        const sub = t.fields.find((f) => (f.type === 'category' || f.type === 'text') && f !== msg && f !== badge && !f.roles.includes('url'))
        if (msg)
          extras.unshift(W({ type: 'timeline', title: `Recent ${label.toLowerCase()}`, table: t.id, size: 2, dateField: pr.date.name, titleField: msg.name, subtitleField: sub?.name, badgeField: badge?.name, visible: relevant || want.activity }))
      }
      const typeF = t.fields.find((f) => /type|kind/i.test(f.name) && f.type === 'category')
      if (typeF) charts.push(W({ type: 'donut', title: `${label} by ${humanize(typeF.name).toLowerCase()}`, table: t.id, size: 2, field: typeF.name, visible: false }))
      stats.push(W({ type: 'stat', title: `${label} events`, table: t.id, size: 1, agg: 'count', visible: false }))
    }

    if (pr.kind === 'tasks') {
      const title = pr.name ?? t.fields.find((f) => f.type === 'text')
      if (pr.done) stats.push(W({ type: 'stat', title: `Completed ${label.toLowerCase()}`, table: t.id, size: 1, agg: 'countWhere', field: pr.done.name, visible: relevant || want.tasks }))
      else stats.push(W({ type: 'stat', title: `Total ${label.toLowerCase()}`, table: t.id, size: 1, agg: 'count', visible: relevant || want.tasks }))
      const grade = pr.metrics.find((m) => /grade|score/i.test(m.name))
      if (grade) stats.push(W({ type: 'stat', title: `Average ${humanize(grade.name).toLowerCase()}`, table: t.id, size: 1, agg: 'avg', field: grade.name, visible: relevant }))
      const hours = pr.metrics.find((m) => /hour|time|minute/i.test(m.name))
      if (hours) stats.push(W({ type: 'stat', title: `${humanize(hours.name)} logged`, table: t.id, size: 1, agg: 'sum', field: hours.name, visible: relevant }))
      if (title && pr.done)
        lists.unshift(W({ type: 'checklist', title: label, table: t.id, size: 2, titleField: title.name, doneField: pr.done.name, subtitleField: pr.cat?.name ?? t.fields.find((f) => /project|course/i.test(f.name))?.name, badgeField: pr.priority?.name, dateField: pr.date?.name, visible: relevant || want.tasks }))
      if (pr.date && title)
        {
          const future = t.rows.filter((r) => Date.parse(String(r[pr.date!.name])) >= Date.now() - 864e5).length
          const upcoming = future >= t.rows.length / 3
          extras.push(W({ type: 'timeline', title: upcoming ? 'Upcoming deadlines' : `Recent ${label.toLowerCase()}`, table: t.id, size: 2, dateField: pr.date.name, titleField: title.name, subtitleField: pr.cat?.name, badgeField: pr.status?.name ?? pr.priority?.name, visible: relevant && (want.schedule || isPrimary) }))
        }
      if (!grade && !hours)
        stats.push(W({ type: 'stat', title: `Total ${label.toLowerCase()}`, table: t.id, size: 1, agg: 'count', visible: relevant }))
      const by = pr.cat ?? t.fields.find((f) => /project|course/i.test(f.name))
      if (by) charts.push(W({ type: 'bar', title: grade ? `${humanize(grade.name)} by ${humanize(by.name).toLowerCase()}` : `${label} per ${humanize(by.name).toLowerCase()}`, table: t.id, size: 2, field: by.name, valueField: grade?.name, agg: grade ? 'avg' : 'count', visible: isPrimary }))
      if (pr.status) charts.push(W({ type: 'donut', title: `${label} status`, table: t.id, size: 2, field: pr.status.name, visible: isPrimary || want.status }))
      lists.push(W({ type: 'table', title: `All ${label.toLowerCase()}`, table: t.id, size: 4, columns: t.fields.slice(0, 7).map((f) => f.name), visible: isPrimary }))
    }

    if (pr.kind === 'goals' && pr.progress) {
      const title = pr.name ?? t.fields.find((f) => f.type === 'text' || f.type === 'category')
      if (title) extras.push(W({ type: 'progress', title: label, table: t.id, size: 2, progressField: pr.progress.name, titleField: title.name, subtitleField: pr.cat?.name, visible: relevant || want.progress }))
      stats.push(W({ type: 'stat', title: `Avg ${label.toLowerCase()} progress`, table: t.id, size: 1, agg: 'avg', field: pr.progress.name, visible: false }))
    }
  }

  // Prompt-driven pass: honour metrics and trends the user explicitly named, for any table.
  const exists = (w: Partial<Widget>) =>
    [...stats, ...charts, ...extras, ...lists].find((x) => x.type === w.type && x.table === w.table && (x.field ?? '') === (w.field ?? '') && (x.valueField ?? '') === (w.valueField ?? '') && (x.dateField ?? '') === (w.dateField ?? ''))
  const add = (bucket: Widget[], w: Widget) => {
    const dup = exists(w)
    if (dup) dup.visible = dup.visible || w.visible
    else bucket.push(w)
  }
  for (const pr of profiles) {
    const { t } = pr
    const label = humanize(t.name)
    const named = pr.metrics.filter((m) => tokens(m.name).some((tk) => pt.includes(tk)))
    for (const m of named) {
      const mLabel = humanize(m.name)
      add(stats, W({ type: 'stat', title: `Total ${mLabel.toLowerCase()}`, table: t.id, size: 1, agg: 'sum', field: m.name, visible: true }))
      const by = pr.cat ?? pr.lang ?? pr.status
      if (by) add(charts, W({ type: 'bar', title: `${mLabel} by ${humanize(by.name).toLowerCase()}`, table: t.id, size: 2, field: by.name, valueField: m.name, agg: 'sum', visible: true }))
      if (pr.date) add(charts, W({ type: 'area', title: `${mLabel} over time`, table: t.id, size: 2, dateField: pr.date.name, valueField: m.name, visible: want.trend }))
    }
    if (pr.date && t.rows.length >= 6 && want.trend && (pr === primary || pr.relevance > 0))
      add(charts, W({ type: 'area', title: `${label} over time`, table: t.id, size: 2, dateField: pr.date.name, visible: true }))
  }

  // Rank KPIs (completion and counts first), keep at most 4 visible; the rest stay in the widget library.
  const prio = (w: Widget) =>
    (w.table === primary?.t.id && w.agg === 'count' ? 0 : w.agg === 'countWhere' && !w.equals ? 1 : w.agg === 'distinct' ? 2 : w.agg === 'avg' ? 3 : w.agg === 'sum' ? 4 : 5) + (w.visible ? 0 : 10)
  stats.sort((x, y) => prio(x) - prio(y))
  let shown = 0
  for (const s of stats) if (s.visible && ++shown > 4) s.visible = false
  // Guarantee something useful is visible.
  if (![...charts, ...lists].some((w) => w.visible)) [...charts, ...lists].slice(0, 3).forEach((w) => (w.visible = true))

  const widgets = balanceLayout([...stats, ...charts, ...extras, ...lists])
  const filterFields = primary ? [primary.status?.name, primary.lang?.name ?? primary.cat?.name].filter((x): x is string => !!x) : []

  const named = prompt.match(/(?:called|named|titled)\s+["“']?([^"”'.,\n]{3,40})/i)?.[1]
  const title = named ?? (DEFAULT_TITLES[archetype] || `${humanize(primary?.t.name ?? 'My')} Explorer`)
  const profile = sources.find((s) => s.profile)?.profile
  const who = (profile?.['name'] as string) || (profile?.['profile.name'] as string)
  const visibleCount = widgets.filter((w) => w.visible).length
  reasoning.push(`Matched your request (${Object.entries(want).filter(([, v]) => v).map(([k]) => k).join(', ') || 'general overview'}) → composed ${visibleCount} widgets, ${widgets.length - visibleCount} more available.`)

  return {
    id: uid(),
    title: title.trim(),
    subtitle: who ? `Built for ${who} from ${sources.map((s) => s.fileName).join(', ')}` : `Generated from ${sources.map((s) => s.fileName).join(', ')}`,
    archetype,
    prompt,
    sourceIds: sources.map((s) => s.id),
    widgets,
    layout: 'grid',
    accent: ACCENTS[archetype],
    engine: 'local',
    reasoning,
    primaryTable: primary?.t.id,
    filterFields,
    overrides: {},
    createdAt: Date.now(),
  }
}

/** Avoid half-empty rows in the 4-column grid: an odd half-width widget out stretches to full width. */
export function balanceLayout(widgets: Widget[]): Widget[] {
  const halves = widgets.filter((w) => w.visible && w.size === 2)
  if (halves.length % 2 === 1) {
    const last = halves[halves.length - 1]
    return widgets.map((w) => (w === last ? { ...w, size: 4 } : w))
  }
  return widgets
}

/* ---------------- AI support ---------------- */

export function describeTables(sources: DataSource[]) {
  return sources.flatMap((s) =>
    s.tables.map((t) => ({
      id: t.id,
      name: t.name,
      file: s.fileName,
      rowCount: t.rows.length,
      fields: t.fields.map((f) => ({ name: f.name, type: f.type, distinct: f.distinct, roles: f.roles, samples: f.samples })),
      sampleRows: t.rows.slice(0, 3),
    })),
  )
}

const REQUIRED: Record<WidgetType, (keyof Widget)[]> = {
  stat: [],
  bar: ['field'],
  donut: ['field'],
  area: ['dateField'],
  cards: ['titleField'],
  table: [],
  timeline: ['dateField', 'titleField'],
  progress: ['progressField', 'titleField'],
  checklist: ['doneField', 'titleField'],
}
const FIELD_KEYS: (keyof Widget)[] = ['field', 'valueField', 'dateField', 'titleField', 'subtitleField', 'badgeField', 'tagField', 'metricField', 'progressField', 'doneField']

/** Validate an untrusted spec (e.g. from the model) against the catalog and the user's real fields. */
export function sanitizeSpec(raw: unknown, sources: DataSource[], prompt: string, local: AppSpec): AppSpec {
  const tables = sources.flatMap((s) => s.tables)
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const findTable = (v: unknown) => tables.find((t) => t.id === v) ?? tables.find((t) => t.name === v)
  const widgets: Widget[] = []
  for (const w of Array.isArray(r.widgets) ? r.widgets.slice(0, 24) : []) {
    if (!w || typeof w !== 'object') continue
    const x = w as Record<string, unknown>
    const type = x.type as WidgetType
    if (!WIDGET_TYPES.includes(type)) continue
    const t = findTable(x.table)
    if (!t) continue
    const names = new Set(t.fields.map((f) => f.name))
    const out: Widget = {
      id: uid(),
      type,
      table: t.id,
      title: String(x.title ?? humanize(type)).slice(0, 60),
      size: ([1, 2, 3, 4].includes(Number(x.size)) ? Number(x.size) : type === 'stat' ? 1 : type === 'cards' || type === 'table' ? 4 : 2) as Widget['size'],
      visible: true,
    }
    for (const k of FIELD_KEYS) if (typeof x[k] === 'string' && names.has(x[k] as string)) (out as unknown as Record<string, unknown>)[k] = x[k]
    if (['count', 'sum', 'avg', 'distinct', 'countWhere'].includes(String(x.agg))) out.agg = x.agg as Widget['agg']
    if (typeof x.equals === 'string') out.equals = x.equals.slice(0, 60)
    if (typeof x.hint === 'string') out.hint = x.hint.slice(0, 80)
    if (Array.isArray(x.columns)) out.columns = x.columns.filter((c): c is string => typeof c === 'string' && names.has(c)).slice(0, 8)
    if (type === 'stat' && out.agg && out.agg !== 'count' && !out.field) continue
    if (REQUIRED[type].some((k) => !out[k])) continue
    widgets.push(out)
  }
  if (!widgets.length) throw new Error('Model returned no usable widgets')
  // Everything the local engine found but the model didn't use stays available in the widget library.
  const used = new Set(widgets.map((w) => `${w.type}:${w.table}:${w.field ?? w.titleField ?? w.dateField ?? ''}`))
  const library = local.widgets
    .filter((w) => !used.has(`${w.type}:${w.table}:${w.field ?? w.titleField ?? w.dateField ?? ''}`))
    .map((w) => ({ ...w, visible: false }))
  const primary = findTable(r.primaryTable)?.id ?? local.primaryTable
  const pt = tables.find((t) => t.id === primary)
  const filterFields = Array.isArray(r.filterFields)
    ? r.filterFields.filter((f): f is string => typeof f === 'string' && !!pt?.fields.some((x) => x.name === f)).slice(0, 2)
    : local.filterFields
  const archetype = (['developer', 'student', 'creator', 'generic'] as const).includes(r.archetype as Archetype) ? (r.archetype as Archetype) : local.archetype
  return {
    ...local,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.slice(0, 60) : local.title,
    subtitle: typeof r.subtitle === 'string' && r.subtitle.trim() ? r.subtitle.slice(0, 140) : local.subtitle,
    archetype,
    accent: ACCENTS[archetype],
    prompt,
    widgets: balanceLayout([...widgets, ...library]),
    engine: 'claude',
    reasoning: Array.isArray(r.reasoning) ? r.reasoning.filter((x): x is string => typeof x === 'string').slice(0, 8).map((s) => s.slice(0, 200)) : local.reasoning,
    primaryTable: primary,
    filterFields: filterFields.length ? filterFields : local.filterFields,
  }
}
