import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import type { Table } from '../types'
import { str, type IRow } from '../lib/data'
import { humanize } from '../lib/parse'

/** Full-screen overlay (portaled to <body> so animated cards can't trap it). */
export function Overlay({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8" onClick={onClose} role="dialog" aria-label={title}>
      <div className={`card fade-up w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} !bg-panel p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[16px] font-medium">{title}</h2>
          <button className="btn btn-ghost !p-1.5" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

const isHttp = (v: unknown) => typeof v === 'string' && /^https?:\/\//i.test(v)

/** Every field of one record, with links and images rendered safely. */
export function DetailsModal({ row, table, onClose }: { row: IRow; table: Table; onClose: () => void }) {
  const titleField = table.fields.find((f) => f.roles.includes('name'))?.name
  const image = table.fields.find((f) => f.roles.includes('image') && isHttp(row[f.name]))
  return (
    <Overlay title={titleField ? str(row[titleField]) : humanize(table.name)} onClose={onClose}>
      {image && <img src={str(row[image.name])} alt="" referrerPolicy="no-referrer" className="mb-4 aspect-video w-full rounded-xl object-cover" />}
      <dl className="divide-y divide-line rounded-xl border border-line">
        {table.fields
          .filter((f) => f.name !== image?.name && row[f.name] !== null && row[f.name] !== undefined && row[f.name] !== '')
          .map((f) => {
            const v = row[f.name]
            return (
              <div key={f.name} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2 text-[12.5px]">
                <dt className="text-muted">{humanize(f.name)}</dt>
                <dd className="min-w-0 break-words">
                  {isHttp(v) ? (
                    <a href={str(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      Open link <ExternalLink size={11} />
                    </a>
                  ) : typeof v === 'boolean' ? (
                    v ? 'Yes' : 'No'
                  ) : typeof v === 'number' ? (
                    v.toLocaleString()
                  ) : (
                    str(v)
                  )}
                </dd>
              </div>
            )
          })}
      </dl>
      <p className="mt-3 text-[11px] text-faint">From {table.name} · your synced data</p>
    </Overlay>
  )
}
