import { useState } from 'react'
import { Binary, Calendar, CheckSquare, Hash, List, Tag, Type } from 'lucide-react'
import type { DataSource, FieldType } from '../types'
import { str } from '../lib/data'
import { SourceIcon } from './DataUploader'

const TYPE_ICON: Record<FieldType, typeof Hash> = { number: Hash, date: Calendar, category: Tag, text: Type, boolean: CheckSquare, list: List }

export function DataPreview({ source }: { source?: DataSource }) {
  const [tab, setTab] = useState(0)
  if (!source)
    return (
      <div className="grid h-full min-h-[240px] place-items-center rounded-2xl border border-line text-sm text-muted">
        <div className="flex flex-col items-center gap-2">
          <Binary size={18} className="text-faint" />
          Select a data source to preview it
        </div>
      </div>
    )
  const t = source.tables[Math.min(tab, source.tables.length - 1)]
  const cols = t.fields.slice(0, 8)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
          <SourceIcon s={source} size={14} />
          <span className="truncate">{source.fileName}</span>
        </div>
        <span className="font-mono text-[11px] text-muted">{t.rows.length} rows · {t.fields.length} fields</span>
      </div>
      {source.tables.length > 1 && (
        <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {source.tables.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setTab(i)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] ${i === tab ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {x.name} <span className="text-faint">{x.rows.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
        {t.fields.map((f) => {
          const Icon = TYPE_ICON[f.type]
          return (
            <span key={f.name} className="chip !py-0.5 !text-[11px]" title={`${f.type}${f.roles.length ? ' · detected as ' + f.roles.join(', ') : ''}`}>
              <Icon size={11} />
              <span className="text-fg">{f.name}</span>
              {f.roles[0] && <span className="text-accent">{f.roles[0]}</span>}
            </span>
          )
        })}
      </div>
      <div className="scroll-thin max-h-[260px] overflow-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-panel">
            <tr>
              {cols.map((c) => (
                <th key={c.name} className="whitespace-nowrap border-b border-line px-4 py-2 font-medium text-muted">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.slice(0, 8).map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                {cols.map((c) => (
                  <td key={c.name} className="max-w-[220px] truncate whitespace-nowrap px-4 py-2 text-fg/85">
                    {str(r[c.name]) || <span className="text-faint">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {source.profile && (
        <div className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
          Profile: {Object.entries(source.profile).slice(0, 4).map(([k, v]) => `${k}: ${str(v)}`).join(' · ')}
        </div>
      )}
    </div>
  )
}
