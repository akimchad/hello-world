import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Eye, Inbox, Play, X } from 'lucide-react'
import type { Widget } from '../types'
import { formatNumber, relativeDate, str, type IRow } from '../lib/data'

/** Only real YouTube video IDs are ever embedded (11 chars, URL-safe); anything else just links out. */
export function youtubeId(row: IRow, w: Widget): string | null {
  const direct = str(row['video_id'])
  if (/^[\w-]{11}$/.test(direct)) return direct
  const link = w.linkField ? str(row[w.linkField]) : ''
  const m = link.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}

const safeHttp = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

function Player({ id, title, link, onClose }: { id: string; title: string; link?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // Portal to <body>: widget cards animate with transforms, which would trap a position:fixed overlay inside the card.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label={title}>
      <div className="fade-up w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3 text-white">
          <div className="min-w-0 truncate text-[14px] font-medium">{title}</div>
          <div className="flex shrink-0 items-center gap-2">
            {link && (
              <a href={link} target="_blank" rel="noreferrer" className="btn !border-white/20 !bg-white/10 !py-1 !text-[12px] !text-white">
                <ExternalLink size={13} /> YouTube
              </a>
            )}
            <button className="btn !border-white/20 !bg-white/10 !p-1.5 !text-white" onClick={onClose} aria-label="Close player">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="aspect-video overflow-hidden rounded-xl bg-black shadow-2xl">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function VideoFeed({ rows, w, compact }: { rows: IRow[]; w: Widget; compact: boolean }) {
  const [playing, setPlaying] = useState<IRow | null>(null)
  const [expanded, setExpanded] = useState(false)
  const sorted = w.dateField ? [...rows].sort((a, b) => str(b[w.dateField!]).localeCompare(str(a[w.dateField!]))) : rows
  const list = w.variant === 'list'
  const limit = list ? (compact ? 6 : 8) : compact ? 8 : 12
  const shown = expanded ? sorted : sorted.slice(0, limit)

  if (!rows.length)
    return (
      <div className="grid min-h-[140px] place-items-center text-[12px] text-muted">
        <div className="flex flex-col items-center gap-1.5">
          <Inbox size={16} className="text-faint" />
          No videos match
        </div>
      </div>
    )

  const open = (r: IRow) => {
    if (youtubeId(r, w)) setPlaying(r)
    else {
      const href = w.linkField ? safeHttp(str(r[w.linkField])) : undefined
      if (href) window.open(href, '_blank', 'noopener,noreferrer')
    }
  }
  const meta = (r: IRow) => (
    <>
      {w.subtitleField && <span className="truncate">{str(r[w.subtitleField])}</span>}
      {w.dateField && r[w.dateField] != null && <span className="shrink-0">· {relativeDate(str(r[w.dateField]))}</span>}
      {w.metricField && r[w.metricField] != null && (
        <span className="flex shrink-0 items-center gap-0.5">
          · <Eye size={10} /> {formatNumber(Number(r[w.metricField]) || 0)}
        </span>
      )}
    </>
  )

  return (
    <>
      {list ? (
        <ul className="space-y-1">
          {shown.map((r) => {
            const thumb = w.imageField ? safeHttp(str(r[w.imageField])) : undefined
            const href = w.linkField ? safeHttp(str(r[w.linkField])) : undefined
            return (
              <li key={r.__i} className="group/row flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-fg/[0.04]">
                <button onClick={() => open(r)} className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-fg/10" aria-label={`Play ${str(r[w.titleField!])}`}>
                  {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover/row:bg-black/30 group-hover/row:opacity-100">
                    <Play size={16} className="fill-white text-white" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => open(r)} className="line-clamp-2 text-left text-[12.5px] leading-snug hover:underline">
                    {str(r[w.titleField!])}
                  </button>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted">{meta(r)}</div>
                </div>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="shrink-0 p-1 text-faint hover:text-fg" aria-label="Open on YouTube">
                    <ExternalLink size={13} />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className={`grid gap-3 ${w.size >= 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {shown.map((r) => {
            const thumb = w.imageField ? safeHttp(str(r[w.imageField])) : undefined
            return (
              <button key={r.__i} onClick={() => open(r)} className="group/card text-left" aria-label={`Play ${str(r[w.titleField!])}`}>
                <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-fg/10">
                  {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.03]" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover/card:bg-black/25">
                    <span className="grid h-10 w-10 scale-90 place-items-center rounded-full bg-black/60 opacity-0 transition group-hover/card:scale-100 group-hover/card:opacity-100">
                      <Play size={16} className="ml-0.5 fill-white text-white" />
                    </span>
                  </span>
                </div>
                <div className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">{str(r[w.titleField!])}</div>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] text-muted">{meta(r)}</div>
              </button>
            )
          })}
        </div>
      )}
      {sorted.length > limit && (
        <button className="btn btn-ghost mx-auto mt-3 !text-[12px]" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `Show all ${sorted.length}`}
        </button>
      )}
      {playing && <Player id={youtubeId(playing, w)!} title={str(playing[w.titleField!])} link={w.linkField ? safeHttp(str(playing[w.linkField])) : undefined} onClose={() => setPlaying(null)} />}
    </>
  )
}
