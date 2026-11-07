import { useState } from 'react'
import { Film, ArrowDown, ArrowUp, BarChart3, CalendarClock, CheckSquare, Columns3, Eye, EyeOff, Gauge, LayoutGrid, ListChecks, Moon, PieChart, Plus, RefreshCw, Rows3, Square, Sun, Table2, Trash2, TrendingUp, X } from 'lucide-react'
import type { AppSpec, Layout, Table, Widget, WidgetType } from '../types'
import { ACCENT_OPTIONS } from '../lib/engine'
import { humanize, uid } from '../lib/parse'

const TYPE_META: Record<WidgetType, { label: string; icon: typeof Gauge }> = {
  stat: { label: 'KPI', icon: Gauge },
  bar: { label: 'Bar chart', icon: BarChart3 },
  donut: { label: 'Donut', icon: PieChart },
  area: { label: 'Trend', icon: TrendingUp },
  cards: { label: 'Cards', icon: LayoutGrid },
  table: { label: 'Table', icon: Table2 },
  timeline: { label: 'Timeline', icon: CalendarClock },
  progress: { label: 'Progress', icon: Rows3 },
  checklist: { label: 'Checklist', icon: ListChecks },
  videos: { label: 'Video feed', icon: Film },
  unified: { label: 'Unified feed', icon: Rows3 },
  summary: { label: 'Summary', icon: Gauge },
  insight: { label: 'Insights', icon: Gauge },
  actions: { label: 'Action items', icon: ListChecks },
}

const BUILDABLE: WidgetType[] = ['stat', 'bar', 'donut', 'area', 'table']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{title}</div>
      {children}
    </div>
  )
}

export function CustomizationPanel(props: {
  app: AppSpec
  tables: Table[]
  theme: 'dark' | 'light'
  onTheme: (t: 'dark' | 'light') => void
  onUpdate: (patch: Partial<AppSpec> | ((a: AppSpec) => Partial<AppSpec>)) => void
  onRegenerate: (prompt: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { app } = props
  const [prompt, setPrompt] = useState(app.prompt)
  const [bType, setBType] = useState<WidgetType>('bar')
  const [bTable, setBTable] = useState(props.tables[0]?.id ?? '')
  const table = props.tables.find((t) => t.id === bTable)
  const fieldChoices =
    table?.fields.filter((f) =>
      bType === 'area' ? f.type === 'date' : bType === 'stat' ? true : bType === 'table' ? false : f.type === 'category' || f.type === 'list' || f.type === 'boolean',
    ) ?? []
  const [bField, setBField] = useState('')
  const field = fieldChoices.find((f) => f.name === bField) ?? fieldChoices[0]

  const visible = app.widgets.filter((w) => w.visible)
  const hidden = app.widgets.filter((w) => !w.visible)
  const setWidgets = (fn: (ws: Widget[]) => Widget[]) => props.onUpdate((a) => ({ widgets: fn(a.widgets) }))
  const move = (id: string, dir: -1 | 1) =>
    setWidgets((ws) => {
      const vis = ws.filter((w) => w.visible)
      const i = vis.findIndex((w) => w.id === id)
      const j = i + dir
      if (j < 0 || j >= vis.length) return ws
      const a = ws.indexOf(vis[i])
      const b = ws.indexOf(vis[j])
      const next = [...ws]
      ;[next[a], next[b]] = [next[b], next[a]]
      return next
    })

  const build = () => {
    if (!table) return
    const w: Widget = { id: uid(), type: bType, table: table.id, visible: true, size: bType === 'stat' ? 1 : bType === 'table' ? 4 : 2, title: '' }
    if (bType === 'stat') {
      if (field?.type === 'number') Object.assign(w, { agg: 'sum', field: field.name, title: `Total ${humanize(field.name).toLowerCase()}` })
      else if (field?.type === 'boolean') Object.assign(w, { agg: 'countWhere', field: field.name, title: humanize(field.name) })
      else if (field) Object.assign(w, { agg: 'distinct', field: field.name, title: `Unique ${humanize(field.name).toLowerCase()}` })
      else Object.assign(w, { agg: 'count', title: `Total ${table.name}` })
    } else if (bType === 'area') {
      if (!field) return
      Object.assign(w, { dateField: field.name, title: `${humanize(table.name)} over time` })
    } else if (bType === 'table') Object.assign(w, { columns: table.fields.slice(0, 7).map((f) => f.name), title: `All ${table.name}` })
    else {
      if (!field) return
      Object.assign(w, { field: field.name, title: `${humanize(table.name)} by ${humanize(field.name).toLowerCase()}` })
    }
    setWidgets((ws) => [...ws, w])
  }
  const canBuild = !!table && (bType === 'stat' || bType === 'table' || !!field)

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={props.onClose} />
      <aside className="fade-up scroll-thin relative h-full w-full max-w-[400px] overflow-y-auto border-l border-line bg-panel shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="font-medium">Customize</div>
            <div className="text-[12px] text-muted">It's your software. Make it yours.</div>
          </div>
          <button className="btn btn-ghost !p-1.5" onClick={props.onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <Section title="Name">
          <input className="input" value={app.title} onChange={(e) => props.onUpdate({ title: e.target.value })} aria-label="Dashboard title" />
        </Section>

        <Section title="Layout">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['grid', 'Grid', LayoutGrid],
                ['compact', 'Compact', Columns3],
                ['focus', 'Single column', Rows3],
              ] as [Layout, string, typeof LayoutGrid][]
            ).map(([k, label, Icon]) => (
              <button key={k} onClick={() => props.onUpdate({ layout: k })} className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[12px] transition ${app.layout === k ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line-2 text-muted hover:text-fg'}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Appearance">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} onClick={() => props.onTheme(t)} className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-[12.5px] capitalize transition ${props.theme === t ? 'border-accent/60 bg-accent/10' : 'border-line-2 text-muted hover:text-fg'}`}>
                {t === 'dark' ? <Moon size={14} /> : <Sun size={14} />} {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[12px] text-muted">Accent</span>
            {ACCENT_OPTIONS.map((c) => (
              <button key={c} onClick={() => props.onUpdate({ accent: c })} aria-label={`Accent ${c}`} className={`h-6 w-6 rounded-full border-2 transition ${app.accent === c ? 'scale-110 border-fg' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </Section>

        <Section title={`Widgets on screen · ${visible.length}`}>
          <ul className="space-y-1">
            {visible.map((w, i) => {
              const Icon = TYPE_META[w.type].icon
              return (
                <li key={w.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]">
                  <Icon size={13} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{w.title}</span>
                  <select
                    className="rounded border border-line bg-transparent px-1 text-[11px] text-muted"
                    value={w.size}
                    onChange={(e) => setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, size: Number(e.target.value) as Widget['size'] } : x)))}
                    aria-label="Widget width"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}/4
                      </option>
                    ))}
                  </select>
                  <button className="text-faint hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(w.id, -1)} aria-label="Move up">
                    <ArrowUp size={13} />
                  </button>
                  <button className="text-faint hover:text-fg disabled:opacity-30" disabled={i === visible.length - 1} onClick={() => move(w.id, 1)} aria-label="Move down">
                    <ArrowDown size={13} />
                  </button>
                  <button className="text-faint hover:text-fg" onClick={() => setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, visible: false } : x)))} aria-label={`Remove ${w.title}`}>
                    <EyeOff size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>

        <Section title={`Widget library · ${hidden.length}`}>
          {hidden.length ? (
            <ul className="space-y-1">
              {hidden.map((w) => {
                const Icon = TYPE_META[w.type].icon
                return (
                  <li key={w.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line-2 px-2.5 py-1.5 text-[12.5px]">
                    <Icon size={13} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-muted">{w.title}</span>
                    <span className="font-mono text-[10px] text-faint">{TYPE_META[w.type].label}</span>
                    <button className="flex items-center gap-1 text-[11.5px] text-accent hover:underline" onClick={() => setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, visible: true } : x)))} aria-label={`Add ${w.title}`}>
                      <Eye size={12} /> Add
                    </button>
                    <button className="text-faint hover:text-red-400" onClick={() => setWidgets((ws) => ws.filter((x) => x.id !== w.id))} aria-label={`Delete ${w.title}`}>
                      <Trash2 size={12} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-[12px] text-muted">Every suggested widget is on screen.</p>
          )}
        </Section>

        <Section title="Build a widget">
          <div className="mb-2 grid grid-cols-5 gap-1.5">
            {BUILDABLE.map((t) => {
              const Icon = TYPE_META[t].icon
              return (
                <button key={t} onClick={() => setBType(t)} className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[10.5px] transition ${bType === t ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line-2 text-muted hover:text-fg'}`}>
                  <Icon size={14} /> {TYPE_META[t].label}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input !text-[12px]" value={bTable} onChange={(e) => setBTable(e.target.value)} aria-label="Table">
              {props.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select className="input !text-[12px]" value={field?.name ?? ''} onChange={(e) => setBField(e.target.value)} disabled={bType === 'table'} aria-label="Field">
              {bType === 'stat' && <option value="">Row count</option>}
              {fieldChoices.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
              {!fieldChoices.length && bType !== 'stat' && <option value="">{bType === 'table' ? 'All columns' : 'No suitable field'}</option>}
            </select>
          </div>
          <button className="btn mt-2 w-full justify-center" disabled={!canBuild} onClick={build}>
            <Plus size={14} /> Add widget
          </button>
        </Section>

        <Section title="Refine & regenerate">
          <textarea className="input min-h-[90px] resize-none !text-[12.5px] leading-relaxed" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Prompt" />
          <button className="btn btn-primary mt-2 w-full justify-center" disabled={prompt.trim().length < 4} onClick={() => props.onRegenerate(prompt)}>
            <RefreshCw size={14} /> Regenerate app
          </button>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
            <Square size={10} /> Regenerating replaces widgets but keeps this app in My Apps.
          </p>
        </Section>

        <div className="px-5 py-4">
          <button className="btn w-full justify-center !border-red-500/30 !text-red-400 hover:!bg-red-500/10" onClick={props.onDelete}>
            <Trash2 size={14} /> Delete app
          </button>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
            <CheckSquare size={11} /> Changes save automatically.
          </p>
        </div>
      </aside>
    </div>
  )
}
