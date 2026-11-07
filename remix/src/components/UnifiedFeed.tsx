import { useMemo, useState } from 'react'
import { ChevronDown, Code2, ExternalLink, Eye, Inbox, Info, Play, Search, Video } from 'lucide-react'
import type { FeedSource } from '../types'
import { formatNumber, relativeDate, type IRow } from '../lib/data'
import { buildFeed, dayLabel, summarize, type FeedItem } from '../lib/feed'
import { Player } from './VideoFeed'

const ytId = (it: FeedItem) => {
  const direct = String(it.row['video_id'] ?? '')
  if (/^[\w-]{11}$/.test(direct)) return direct
  return it.link?.match(/youtube\.com\/watch\?v=([\w-]{11})/)?.[1] ?? null
}

type Mode = 'all' | 'code' | 'video'

/** One timeline for videos and code activity, with All / Code only / Video only and a topic search. */
export function UnifiedFeed(props: { feeds: FeedSource[]; rowsOf: (t: string) => IRow[]; compact: boolean; onOpenRow: (row: IRow, table: string) => void }) {
  const [mode, setMode] = useState<Mode>('all')
  const [topic, setTopic] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(props.compact ? 10 : 15)
  const [playing, setPlaying] = useState<FeedItem | null>(null)
  const all = useMemo(() => buildFeed(props.feeds, props.rowsOf), [props.feeds, props.rowsOf])
  const kinds = new Set(all.map((x) => x.kind))
  const items = all.filter((x) => (mode === 'all' || x.kind === mode) && (!topic || `${x.title} ${x.subtitle} ${x.badge ?? ''}`.toLowerCase().includes(topic.toLowerCase())))
  const shown = items.slice(0, limit)

  let lastDay = ''
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line-2 p-0.5" role="tablist" aria-label="Feed filter">
          {(
            [
              ['all', 'All', null],
              ['code', 'Code only', Code2],
              ['video', 'Video only', Video],
            ] as [Mode, string, typeof Code2 | null][]
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={m !== 'all' && !kinds.has(m)}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] transition disabled:opacity-35 ${mode === m ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {Icon && <Icon size={12} />} {label}
              <span className="font-mono text-[10px] text-faint">{m === 'all' ? all.length : all.filter((x) => x.kind === m).length}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[160px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input !py-1.5 !pl-8 !text-[12.5px]" placeholder="Topic search…" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic search" />
        </div>
      </div>

      {!shown.length ? (
        <div className="grid min-h-[120px] place-items-center text-[12px] text-muted">
          <div className="flex flex-col items-center gap-1.5">
            <Inbox size={16} className="text-faint" />
            Nothing matches
          </div>
        </div>
      ) : (
        <ol className="space-y-1">
          {shown.map((it) => {
            const d = dayLabel(it.time)
            const header = d !== lastDay ? d : null
            lastDay = d
            const isOpen = open === it.key
            const vid = it.kind === 'video' ? ytId(it) : null
            return (
              <li key={it.key}>
                {header && <div className="mb-1 mt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint first:mt-0">{header}</div>}
                <div className={`rounded-xl border transition ${isOpen ? 'border-line-2 bg-panel-2' : 'border-transparent hover:bg-fg/[0.03]'}`}>
                  <button className="flex w-full items-center gap-3 p-2 text-left" onClick={() => setOpen(isOpen ? null : it.key)} aria-expanded={isOpen}>
                    {it.kind === 'video' ? (
                      <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-fg/10">
                        {it.image && <img src={it.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                      </span>
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2 bg-panel-2 text-accent">
                        <Code2 size={15} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[13px]">{it.title}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                        <span className={`rounded px-1 font-mono text-[9.5px] uppercase ${it.kind === 'video' ? 'bg-rose-500/15 text-rose-300 light:text-rose-700' : 'bg-accent/15 text-accent'}`}>{it.kind}</span>
                        <span className="truncate">{it.subtitle}</span>
                        {it.badge && <span className="shrink-0">· {it.badge}</span>}
                        {it.metric !== undefined && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            · <Eye size={10} /> {formatNumber(it.metric)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">{relativeDate(it.date)}</span>
                    <ChevronDown size={13} className={`shrink-0 text-faint transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="fade-up flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
                      {it.kind === 'video' && it.image && (
                        <img src={it.image} alt="" referrerPolicy="no-referrer" className="aspect-video w-full max-w-[280px] rounded-lg object-cover" />
                      )}
                      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                        <div className="text-[12.5px]">{it.title}</div>
                        <div className="text-[11.5px] text-muted">
                          {it.subtitle} · {new Date(it.time).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {vid && (
                            <button className="btn btn-primary !py-1 !text-[12px]" onClick={() => setPlaying(it)}>
                              <Play size={12} /> Play
                            </button>
                          )}
                          {it.link && (
                            <a className="btn !py-1 !text-[12px]" href={it.link} target="_blank" rel="noreferrer">
                              <ExternalLink size={12} /> {it.kind === 'video' ? 'YouTube' : 'GitHub'}
                            </a>
                          )}
                          <button className="btn btn-ghost !py-1 !text-[12px]" onClick={() => props.onOpenRow(it.row, it.table)}>
                            <Info size={12} /> All details
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {items.length > shown.length && (
        <button className="btn btn-ghost mx-auto mt-2 !text-[12px]" onClick={() => setLimit((l) => l + 15)}>
          Show more ({items.length - shown.length} left)
        </button>
      )}
      {playing && ytId(playing) && <Player id={ytId(playing)!} title={playing.title} link={playing.link} onClose={() => setPlaying(null)} />}
    </div>
  )
}

/** Auto-generated, plain-language summary of the newest releases and activity. */
export function SummaryCard(props: { feeds: FeedSource[]; rowsOf: (t: string) => IRow[]; onOpenRow: (row: IRow, table: string) => void }) {
  const items = useMemo(() => buildFeed(props.feeds, props.rowsOf), [props.feeds, props.rowsOf])
  const s = summarize(items)
  const [playing, setPlaying] = useState<FeedItem | null>(null)
  if (!s) return <div className="text-[12.5px] text-muted">No dated items to summarize yet. Sync an account or clear your filters.</div>
  return (
    <div>
      <p className="text-[15px] leading-relaxed text-fg">{s.headline}</p>
      <ul className="mt-3 space-y-1.5">
        {s.lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] text-muted">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
            {l.item ? (
              <button
                className="text-left hover:text-fg hover:underline"
                onClick={() => (l.item!.kind === 'video' && ytId(l.item!) ? setPlaying(l.item!) : props.onOpenRow(l.item!.row, l.item!.table))}
              >
                {l.text}
              </button>
            ) : (
              <span>{l.text}</span>
            )}
          </li>
        ))}
      </ul>
      {playing && <Player id={ytId(playing)!} title={playing.title} link={playing.link} onClose={() => setPlaying(null)} />}
    </div>
  )
}
