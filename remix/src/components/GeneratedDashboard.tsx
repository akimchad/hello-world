import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Cpu, Database, Pencil, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import type { AppSpec, DataSource, Table } from '../types'
import { matchesSearch, rowsWithOverrides, str, type IRow } from '../lib/data'
import { humanize } from '../lib/parse'
import { DashboardWidget } from './DashboardWidget'
import { CustomizationPanel } from './CustomizationPanel'

const SPAN: Record<number, string> = { 1: 'lg:col-span-1', 2: 'sm:col-span-2 lg:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' }
const STAT_COLS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }

/** Darken an accent so it keeps contrast on light backgrounds. */
function forTheme(hex: string, theme: 'dark' | 'light') {
  if (theme === 'dark' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const k = 0.58
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0'))
  return '#' + c.join('')
}

export function GeneratedDashboard(props: {
  app: AppSpec
  sources: DataSource[]
  theme: 'dark' | 'light'
  onTheme: (t: 'dark' | 'light') => void
  onUpdate: (patch: Partial<AppSpec> | ((a: AppSpec) => Partial<AppSpec>)) => void
  onRegenerate: (prompt: string) => void
  onBack: () => void
  onDelete: () => void
}) {
  const { app } = props
  const accent = forTheme(app.accent, props.theme)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [why, setWhy] = useState(false)

  const tables = useMemo(() => {
    const m = new Map<string, Table>()
    for (const s of props.sources) for (const t of s.tables) m.set(t.id, t)
    return m
  }, [props.sources])
  const missing = app.sourceIds.filter((id) => !props.sources.some((s) => s.id === id))
  const primary = app.primaryTable ? tables.get(app.primaryTable) : undefined

  const filterOptions = useMemo(
    () =>
      app.filterFields.map((f) => ({
        field: f,
        values: primary ? [...new Set(primary.rows.flatMap((r) => (Array.isArray(r[f]) ? (r[f] as unknown[]).map(String) : [str(r[f])])).filter(Boolean))].sort() : [],
      })),
    [app.filterFields, primary],
  )

  const rowsFor = useMemo(() => {
    const cache = new Map<string, { rows: IRow[]; total: number }>()
    return (tableId: string) => {
      if (cache.has(tableId)) return cache.get(tableId)!
      const t = tables.get(tableId)
      if (!t) return { rows: [], total: 0 }
      let rows = rowsWithOverrides(t, app.overrides)
      const total = rows.length
      if (tableId === app.primaryTable)
        for (const [f, v] of Object.entries(filters)) if (v) rows = rows.filter((r) => (Array.isArray(r[f]) ? (r[f] as unknown[]).map(String).includes(v) : str(r[f]) === v))
      if (query) rows = rows.filter((r) => matchesSearch(r, query))
      const res = { rows, total }
      cache.set(tableId, res)
      return res
    }
  }, [tables, app.overrides, app.primaryTable, filters, query])

  const visible = app.widgets.filter((w) => w.visible && tables.has(w.table))
  const primaryCounts = primary ? rowsFor(primary.id) : null
  const compact = app.layout === 'compact'
  const focus = app.layout === 'focus'
  const activeFilters = Object.values(filters).filter(Boolean).length + (query ? 1 : 0)

  return (
    <div className="relative" style={{ ['--accent' as string]: accent, ['--accent-ink' as string]: props.theme === 'light' ? '#ffffff' : '#0b0b0c' }}>
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[320px] opacity-70" />
      <div className={`relative mx-auto px-4 pb-16 pt-6 sm:px-6 ${focus ? 'max-w-3xl' : 'max-w-[1240px]'}`}>
        {/* top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button className="btn btn-ghost !px-2 !text-[12.5px]" onClick={props.onBack}>
            <ArrowLeft size={14} /> Workspace
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => props.onRegenerate(app.prompt)} title="Regenerate from the same prompt">
              <RefreshCw size={14} /> Regenerate
            </button>
            <button className="btn btn-primary" onClick={() => setPanel(true)}>
              <SlidersHorizontal size={14} /> Customize
            </button>
          </div>
        </div>

        {/* header */}
        <div className="fade-up mb-5">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
            <span className="chip !py-0.5">
              {app.engine === 'claude' ? <Sparkles size={11} className="text-accent" /> : <Cpu size={11} className="text-accent" />}
              {app.engine === 'claude' ? 'Generated with Claude' : 'Generated by REMIX local engine'}
            </span>
            <span className="chip !py-0.5">
              <Database size={11} /> {app.sourceIds.length} source{app.sourceIds.length === 1 ? '' : 's'}
            </span>
            <span className="chip !py-0.5">{visible.length} widgets</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {editing ? (
              <input
                autoFocus
                className="input !w-auto !bg-transparent !px-2 !py-1 !text-3xl !font-semibold"
                defaultValue={app.title}
                onBlur={(e) => {
                  props.onUpdate({ title: e.target.value.trim() || app.title })
                  setEditing(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h1 className="group flex cursor-text items-center gap-2 text-[28px] font-semibold tracking-[-0.02em] sm:text-[34px]" onClick={() => setEditing(true)}>
                {app.title}
                <Pencil size={15} className="text-faint opacity-0 transition group-hover:opacity-100" />
              </h1>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-muted">{app.subtitle}</p>
          <button className="mt-3 flex items-center gap-1 text-[12px] text-muted hover:text-fg" onClick={() => setWhy((w) => !w)}>
            How REMIX built this <ChevronDown size={12} className={`transition ${why ? 'rotate-180' : ''}`} />
          </button>
          {why && (
            <div className="card fade-up mt-2 p-4 text-[12.5px]">
              <div className="mb-2 text-muted">Your prompt</div>
              <p className="mb-3 italic">“{app.prompt}”</p>
              <div className="mb-2 text-muted">Analysis</div>
              <ul className="space-y-1 font-mono text-[11.5px] text-fg/80">
                {app.reasoning.map((r, i) => (
                  <li key={i}>
                    <span className="text-accent">→</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {missing.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-[12.5px] text-amber-200 light:text-amber-800">
            {missing.length} data source{missing.length > 1 ? 's were' : ' was'} removed from your workspace. Widgets that depended on {missing.length > 1 ? 'them' : 'it'} are hidden — re-upload the data and regenerate.
          </div>
        )}

        {/* toolbar */}
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !border-transparent !bg-transparent !pl-9" placeholder="Search everything in this app…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {filterOptions.map((f) => (
            <select
              key={f.field}
              className="input !w-auto cursor-pointer !py-1.5 !text-[12.5px]"
              value={filters[f.field] ?? ''}
              onChange={(e) => setFilters((s) => ({ ...s, [f.field]: e.target.value }))}
              aria-label={`Filter by ${f.field}`}
            >
              <option value="">All {humanize(f.field).toLowerCase()}</option>
              {f.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
          {activeFilters > 0 && (
            <button
              className="btn btn-ghost !text-[12px]"
              onClick={() => {
                setFilters({})
                setQuery('')
              }}
            >
              <X size={12} /> Clear
            </button>
          )}
          {primaryCounts && (
            <span className="px-2 font-mono text-[11px] text-muted">
              {primaryCounts.rows.length}/{primaryCounts.total} {primary?.name}
            </span>
          )}
        </div>

        {/* widgets */}
        {visible.length ? (
          <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
            {[visible.filter((w) => w.type === 'stat'), visible.filter((w) => w.type !== 'stat')].map((group, gi) =>
              group.length ? (
                <div
                  key={gi}
                  className={`grid grid-flow-dense ${compact ? 'gap-2.5' : 'gap-4'} ${
                    gi === 0 ? `grid-cols-2 ${focus ? '' : STAT_COLS[Math.min(group.length, 4)]}` : focus ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                  }`}
                >
                  {group.map((w, i) => (
                    <div key={w.id} className={`fade-up min-w-0 ${gi === 0 || focus ? '' : SPAN[w.size]}`} style={{ animationDelay: `${Math.min(i + gi * 4, 12) * 50}ms` }}>
                      <DashboardWidget
                        w={w}
                        rows={rowsFor(w.table).rows}
                        accent={accent}
                        compact={compact}
                        onHide={() => props.onUpdate((a) => ({ widgets: a.widgets.map((x) => (x.id === w.id ? { ...x, visible: false } : x)) }))}
                        onToggleDone={(row, field, value) => props.onUpdate((a) => ({ overrides: { ...a.overrides, [`${w.table}#${row.__i}#${field}`]: value } }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <div className="font-medium">This app has no visible widgets</div>
            <p className="mt-1 text-[13px] text-muted">Open Customize to add widgets from the library.</p>
            <button className="btn btn-primary mt-4" onClick={() => setPanel(true)}>
              <SlidersHorizontal size={14} /> Customize
            </button>
          </div>
        )}
      </div>

      {panel && (
        <CustomizationPanel
          app={app}
          tables={[...tables.values()].filter((t) => app.sourceIds.some((id) => t.id.startsWith(id + ':')))}
          theme={props.theme}
          onTheme={props.onTheme}
          onUpdate={props.onUpdate}
          onRegenerate={(p) => {
            setPanel(false)
            props.onRegenerate(p)
          }}
          onDelete={props.onDelete}
          onClose={() => setPanel(false)}
        />
      )}
    </div>
  )
}
