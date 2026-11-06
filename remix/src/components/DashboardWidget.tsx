import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, Check, ChevronDown, EyeOff, Inbox, Star } from 'lucide-react'
import type { Widget } from '../types'
import { formatNumber, groupBy, isDone, relativeDate, statValue, str, timeSeries, type IRow } from '../lib/data'
import { humanize } from '../lib/parse'

const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0')
const palette = (accent: string) => [accent, alpha(accent, 0.7), alpha(accent, 0.48), alpha(accent, 0.3), '#8b8b93', '#5a5a62', '#3a3a40']

function Empty({ label = 'No matching records' }: { label?: string }) {
  return (
    <div className="grid h-full min-h-[120px] place-items-center text-[12px] text-muted">
      <div className="flex flex-col items-center gap-1.5">
        <Inbox size={16} className="text-faint" />
        {label}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string; payload?: { name: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 text-[12px] shadow-xl">
      <div className="text-muted">{label ?? payload[0].payload?.name}</div>
      <div className="font-mono font-medium">{formatNumber(payload[0].value, true)}</div>
    </div>
  )
}

const Badge = ({ v }: { v: unknown }) => {
  const s = str(v)
  if (!s) return null
  const good = /active|done|complete|published|shipped|submitted|graded|merged|release/i.test(s)
  const warn = /paused|progress|scheduled|drafting|medium|review/i.test(s)
  const bad = /high|blocked|overdue|not started|issue/i.test(s)
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] ${
        good ? 'border-emerald-400/25 text-emerald-300 light:text-emerald-700' : bad ? 'border-rose-400/25 text-rose-300 light:text-rose-700' : warn ? 'border-amber-400/25 text-amber-200 light:text-amber-700' : 'border-line-2 text-muted'
      }`}
    >
      {s}
    </span>
  )
}

export function ProjectCard({ row, w }: { row: IRow; w: Widget }) {
  const title = str(row[w.titleField!])
  const progress = w.progressField ? Number(row[w.progressField]) : NaN
  const pct = isNaN(progress) ? null : Math.max(0, Math.min(100, progress <= 1 && progress > 0 ? progress * 100 : progress))
  return (
    <div className="group rounded-xl border border-line bg-bg-2/60 p-3.5 transition hover:border-line-2 hover:bg-panel-2">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 bg-panel-2 font-mono text-[12px] uppercase text-accent">{title.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-medium">{title}</span>
            {w.badgeField && <Badge v={row[w.badgeField]} />}
          </div>
          {w.subtitleField && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">{str(row[w.subtitleField])}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted">
        {w.tagField && row[w.tagField] != null && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {str(row[w.tagField])}
          </span>
        )}
        {w.metricField && row[w.metricField] != null && (
          <span className="flex items-center gap-1">
            <Star size={11} /> {formatNumber(Number(row[w.metricField]) || 0)} <span className="text-faint">{humanize(w.metricField).toLowerCase()}</span>
          </span>
        )}
        {pct !== null && <span className="ml-auto font-mono text-[11px]">{Math.round(pct)}%</span>}
      </div>
      {pct !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-fg/10">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function TableView({ rows, w }: { rows: IRow[]; w: Widget }) {
  const cols = w.columns?.length ? w.columns : Object.keys(rows[0] ?? {}).filter((k) => k !== '__i').slice(0, 7)
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    return [...rows].sort((a, b) => {
      const x = a[sort.k]
      const y = b[sort.k]
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
      return str(x).localeCompare(str(y)) * sort.dir
    })
  }, [rows, sort])
  if (!rows.length) return <Empty />
  return (
    <div className="scroll-thin max-h-[360px] overflow-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2 font-medium text-muted">
                <button className="flex items-center gap-1 hover:text-fg" onClick={() => setSort((s) => ({ k: c, dir: s?.k === c && s.dir === 1 ? -1 : 1 }))}>
                  {humanize(c)}
                  {sort?.k === c && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.__i} className="border-b border-line/60 transition last:border-0 hover:bg-fg/[0.03]">
              {cols.map((c) => (
                <td key={c} className="max-w-[260px] truncate whitespace-nowrap px-3 py-2">
                  {typeof r[c] === 'boolean' ? (r[c] ? <Check size={13} className="text-accent" /> : <span className="text-faint">—</span>) : /status|state|stage|priority/i.test(c) ? <Badge v={r[c]} /> : str(r[c]) || <span className="text-faint">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DashboardWidget(props: {
  w: Widget
  rows: IRow[]
  accent: string
  compact: boolean
  onToggleDone: (row: IRow, field: string, value: boolean) => void
  onHide: () => void
}) {
  const { w, rows, accent, compact } = props
  const [expanded, setExpanded] = useState(false)
  const chartH = compact ? 170 : 220

  let body: React.ReactNode = null
  let meta: string | undefined = w.hint

  switch (w.type) {
    case 'stat': {
      const s = statValue(rows, w)
      return (
        <div className={`card group relative h-full overflow-hidden ${compact ? 'p-3.5' : 'p-5'}`}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/[0.07] blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted">{w.title}</span>
            <button onClick={props.onHide} className="opacity-0 transition group-hover:opacity-100" aria-label={`Hide ${w.title}`}>
              <EyeOff size={13} className="text-faint hover:text-fg" />
            </button>
          </div>
          <div className={`mt-2 font-semibold tracking-tight ${compact ? 'text-2xl' : 'text-[32px] leading-none'}`}>
            {s.display}
            {s.of !== undefined && <span className="ml-1 text-base font-normal text-faint">/ {s.of}</span>}
          </div>
          {s.of !== undefined && s.of > 0 && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-fg/10">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(s.value / s.of) * 100}%` }} />
            </div>
          )}
          {s.of === undefined && <div className="mt-3 text-[11px] text-faint">{w.agg === 'distinct' ? 'unique values' : w.agg === 'avg' ? 'average' : w.agg === 'sum' ? 'total across records' : 'records'}</div>}
        </div>
      )
    }
    case 'bar': {
      const data = groupBy(rows, w.field!, w.valueField, w.valueField ? w.agg === 'avg' ? 'avg' : 'sum' : 'count').slice(0, 8)
      meta ??= w.valueField ? `${w.agg === 'avg' ? 'Average' : 'Total'} ${humanize(w.valueField).toLowerCase()}` : `Count by ${humanize(w.field!).toLowerCase()}`
      body = data.length ? (
        <ResponsiveContainer width="100%" height={Math.max(chartH - 20, data.length * 30 + 10)}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11.5 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--line)' }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14} animationDuration={600}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 ? accent : alpha(accent, Math.max(0.25, 0.75 - i * 0.08))} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty />
      )
      break
    }
    case 'donut': {
      const data = groupBy(rows, w.field!).slice(0, 7)
      const total = data.reduce((a, d) => a + d.value, 0)
      const colors = palette(accent)
      body = data.length ? (
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: chartH - 40, height: chartH - 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" animationDuration={600}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-xl font-semibold">{total}</div>
                <div className="text-[10px] text-muted">total</div>
              </div>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {data.map((d, i) => (
              <li key={d.name} className="flex items-center gap-2 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
                <span className="truncate text-fg/85">{d.name}</span>
                <span className="ml-auto font-mono text-muted">{Math.round((d.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Empty />
      )
      break
    }
    case 'area': {
      const data = timeSeries(rows, w.dateField!, w.valueField)
      meta ??= w.valueField ? `${humanize(w.valueField)} by ${humanize(w.dateField!).toLowerCase()}` : `Records by ${humanize(w.dateField!).toLowerCase()}`
      const gid = `g-${w.id}`
      body = data.length ? (
        <ResponsiveContainer width="100%" height={chartH}>
          <AreaChart data={data} margin={{ left: -18, right: 6, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--faint)', fontSize: 10.5 }} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--faint)', fontSize: 10.5 }} allowDecimals={false} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line-2)' }} />
            <Area type="monotoneX" dataKey="value" stroke={accent} strokeWidth={2} fill={`url(#${gid})`} animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Empty label="No dated records" />
      )
      break
    }
    case 'cards': {
      const limit = compact ? 6 : 9
      const shown = expanded ? rows : rows.slice(0, limit)
      meta = `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`
      body = rows.length ? (
        <>
          <div className={`grid gap-3 ${w.size >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {shown.map((r) => (
              <ProjectCard key={r.__i} row={r} w={w} />
            ))}
          </div>
          {rows.length > limit && (
            <button className="btn btn-ghost mx-auto mt-3 !text-[12px]" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : `Show all ${rows.length}`} <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} />
            </button>
          )}
        </>
      ) : (
        <Empty />
      )
      break
    }
    case 'table':
      meta = `${rows.length} rows · click a column to sort`
      body = <TableView rows={rows} w={w} />
      break
    case 'timeline': {
      const withDate = rows.filter((r) => !isNaN(Date.parse(str(r[w.dateField!]))))
      const future = withDate.filter((r) => Date.parse(str(r[w.dateField!])) >= Date.now() - 864e5).length
      const asc = future > withDate.length / 2 || /upcoming|deadline|schedule/i.test(w.title)
      const sorted = [...withDate].sort((a, b) => (Date.parse(str(a[w.dateField!])) - Date.parse(str(b[w.dateField!]))) * (asc ? 1 : -1))
      const shown = expanded ? sorted : sorted.slice(0, compact ? 5 : 7)
      body = shown.length ? (
        <>
          <ol className="relative space-y-0.5">
            <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line-2" />
            {shown.map((r) => {
              const d = str(r[w.dateField!])
              const overdue = asc && Date.parse(d) < Date.now() - 864e5
              return (
                <li key={r.__i} className="relative flex items-start gap-3 rounded-lg py-1.5 pl-0 pr-1">
                  <span className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-panel ${overdue ? 'bg-rose-400' : 'bg-accent'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px]">{str(r[w.titleField!])}</span>
                      <span className={`shrink-0 font-mono text-[11px] ${overdue ? 'text-rose-400' : 'text-muted'}`}>{relativeDate(d)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
                      {w.subtitleField && <span className="truncate">{str(r[w.subtitleField])}</span>}
                      {w.badgeField && <Badge v={r[w.badgeField]} />}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          {sorted.length > shown.length || expanded ? (
            <button className="btn btn-ghost mt-1 !text-[12px]" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : `Show all ${sorted.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <Empty />
      )
      break
    }
    case 'progress': {
      const items = rows
        .map((r) => {
          const v = Number(r[w.progressField!])
          return { r, v: isNaN(v) ? 0 : v <= 1 && v > 0 ? v * 100 : v }
        })
        .sort((a, b) => b.v - a.v)
      const avg = items.length ? items.reduce((a, x) => a + x.v, 0) / items.length : 0
      meta = `${Math.round(avg)}% average`
      body = items.length ? (
        <ul className="space-y-3">
          {items.slice(0, expanded ? undefined : 7).map(({ r, v }) => (
            <li key={r.__i}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate">{str(r[w.titleField!])}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {w.subtitleField && <span className="mr-2 font-sans text-faint">{str(r[w.subtitleField])}</span>}
                  {Math.round(v)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, v)}%`, background: v >= 100 ? accent : alpha(accent, 0.45 + (v / 100) * 0.55) }} />
              </div>
            </li>
          ))}
          {items.length > 7 && (
            <button className="btn btn-ghost !text-[12px]" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : `Show all ${items.length}`}
            </button>
          )}
        </ul>
      ) : (
        <Empty />
      )
      break
    }
    case 'checklist': {
      const doneCount = rows.filter((r) => isDone(r[w.doneField!])).length
      const sorted = [...rows].sort((a, b) => Number(isDone(a[w.doneField!])) - Number(isDone(b[w.doneField!])))
      meta = `${doneCount} of ${rows.length} done`
      body = rows.length ? (
        <ul className="scroll-thin max-h-[340px] space-y-1 overflow-auto pr-1">
          {sorted.map((r) => {
            const d = isDone(r[w.doneField!])
            return (
              <li key={r.__i}>
                <button onClick={() => props.onToggleDone(r, w.doneField!, !d)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-fg/[0.04]">
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition ${d ? 'border-accent bg-accent text-accent-ink' : 'border-line-2'}`}>
                    {d && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] transition ${d ? 'text-faint line-through' : ''}`}>{str(r[w.titleField!])}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      {w.subtitleField && <span className="truncate">{str(r[w.subtitleField])}</span>}
                      {w.dateField && r[w.dateField] != null && <span className="font-mono">{relativeDate(str(r[w.dateField]))}</span>}
                    </span>
                  </span>
                  {w.badgeField && !d && <Badge v={r[w.badgeField]} />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty />
      )
      break
    }
  }

  return (
    <div className={`card group flex h-full flex-col ${compact ? 'p-3.5' : 'p-5'}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium">{w.title}</h3>
          {meta && <p className="mt-0.5 text-[11.5px] text-muted">{meta}</p>}
        </div>
        <button onClick={props.onHide} className="btn btn-ghost !p-1 opacity-0 transition group-hover:opacity-100" aria-label={`Hide ${w.title}`} title="Remove widget">
          <EyeOff size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  )
}
