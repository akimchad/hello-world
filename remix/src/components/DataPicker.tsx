import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Database, Plug } from 'lucide-react'
import type { DataSource } from '../types'
import { SourceIcon } from './DataUploader'
import { GitHubMark, YouTubeMark } from './ConnectedAccounts'

/** Tables of a source that the user has chosen to feed into generation. */
export const usableTables = (s: DataSource) => s.tables.filter((t) => !s.excludedTables?.includes(t.name))
/** Sources narrowed to their included tables (sources with nothing left are dropped). */
export const usableSources = (list: DataSource[]) =>
  list.map((s) => ({ ...s, tables: usableTables(s) })).filter((s) => s.tables.length > 0)

export function SourceBadge({ s, size = 14 }: { s: DataSource; size?: number }) {
  if (s.account?.avatar) return <img src={s.account.avatar} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  if (s.connector === 'github') return <GitHubMark size={size - 2} />
  if (s.connector === 'youtube') return <YouTubeMark size={size} />
  return <SourceIcon s={s} size={size - 2} />
}

export const sourceLabel = (s: DataSource) =>
  s.connector ? `${s.connector === 'github' ? 'GitHub' : 'YouTube'} · ${s.account?.name ?? s.fileName}` : s.fileName

/** Popover for choosing which sources — and which datasets inside them — a generated app should use. */
export function DataPicker(props: {
  sources: DataSource[]
  selected: string[]
  connected: string[]
  onToggleSource: (id: string) => void
  onToggleTable: (id: string, table: string) => void
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const ordered = [...props.sources].sort((a, b) => Number(!!b.connector) - Number(!!a.connector))
  return (
    <div className="relative" ref={ref}>
      <button className="btn !py-1.5 !text-[12px]" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <Database size={13} /> Choose data <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose data for this app" className="card fade-up absolute bottom-full left-0 z-30 mb-2 w-[min(380px,calc(100vw-48px))] p-2 text-left">
          <div className="px-2 pb-2 pt-1 text-[12px] text-muted">Pick the sources and datasets this app should be built from.</div>
          {!ordered.length && <div className="px-2 py-4 text-center text-[12.5px] text-muted">No data yet. Upload a file or connect an account.</div>}
          <ul className="scroll-thin max-h-[320px] space-y-1 overflow-auto">
            {ordered.map((s) => {
              const on = props.selected.includes(s.id)
              const stale = s.connector && !props.connected.includes(s.connector)
              return (
                <li key={s.id} className={`rounded-xl border ${on ? 'border-line-2 bg-panel-2' : 'border-transparent'}`}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2">
                    <input type="checkbox" checked={on} onChange={() => props.onToggleSource(s.id)} className="accent-[var(--accent)]" />
                    <span className="grid h-5 w-5 shrink-0 place-items-center">
                      <SourceBadge s={s} size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{sourceLabel(s)}</span>
                    {s.connector && (
                      <span className={`font-mono text-[9px] uppercase tracking-wider ${stale ? 'text-amber-400' : 'text-emerald-400'}`}>{stale ? 'snapshot' : 'live'}</span>
                    )}
                    {s.sample && <span className="font-mono text-[9px] uppercase tracking-wider text-faint">demo</span>}
                  </label>
                  {on && s.tables.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5 pl-9">
                      {s.tables.map((t) => {
                        const inc = !s.excludedTables?.includes(t.name)
                        return (
                          <button
                            key={t.id}
                            onClick={() => props.onToggleTable(s.id, t.name)}
                            aria-pressed={inc}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${inc ? 'border-accent/50 bg-accent/10 text-fg' : 'border-line-2 text-faint line-through'}`}
                          >
                            {inc && <Check size={10} />} {t.name} <span className="text-faint">{t.rows.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted hover:bg-fg/5 hover:text-fg"
            onClick={() => {
              setOpen(false)
              props.onManage()
            }}
          >
            <Plug size={13} /> Connect GitHub or YouTube, manage files…
          </button>
        </div>
      )}
    </div>
  )
}
