import { useRef, useState } from 'react'
import { CheckCircle2, Database, FileJson, FileSpreadsheet, Trash2, UploadCloud } from 'lucide-react'
import type { DataSource } from '../types'
import { buildSource, formatBytes } from '../lib/parse'

export function useFileImport(onAdd: (s: DataSource) => void) {
  const [error, setError] = useState<string | null>(null)
  const importFiles = async (files: FileList | File[]) => {
    setError(null)
    for (const f of Array.from(files)) {
      try {
        if (!/\.(json|csv)$/i.test(f.name)) throw new Error(`${f.name}: only .json and .csv files are supported`)
        if (f.size > 3 * 1024 * 1024) throw new Error(`${f.name}: file is larger than 3 MB`)
        onAdd(buildSource(f.name, await f.text()))
      } catch (e) {
        setError(e instanceof Error ? (e.message.startsWith(f.name) ? e.message : `${f.name}: ${e.message}`) : 'Could not read file')
      }
    }
  }
  return { importFiles, error, setError }
}

export function DataUploader({ onAdd, compact }: { onAdd: (s: DataSource) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const { importFiles, error } = useFileImport(onAdd)
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          importFiles(e.dataTransfer.files)
        }}
        onClick={() => input.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed text-center transition ${
          compact ? 'px-4 py-6' : 'px-6 py-10'
        } ${over ? 'border-accent bg-accent/5' : 'border-line-2 bg-bg-2/50 hover:border-fg/25'}`}
      >
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-line-2 bg-panel-2 transition group-hover:scale-105">
          <UploadCloud size={20} className={over ? 'text-accent' : 'text-muted'} />
        </div>
        <div className="text-sm font-medium">Drop JSON or CSV files here</div>
        <div className="mt-1 text-xs text-muted">
          or <span className="text-fg underline decoration-line-2 underline-offset-4">browse files</span> · up to 3 MB each
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          multiple
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) importFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {error && <div className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
    </div>
  )
}

export function SourceIcon({ s, size = 16 }: { s: DataSource; size?: number }) {
  return s.format === 'json' ? <FileJson size={size} /> : <FileSpreadsheet size={size} />
}

export function SourceList(props: {
  sources: DataSource[]
  selected: string[]
  previewId: string | null
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onPreview: (id: string) => void
  connected?: string[]
}) {
  if (!props.sources.length)
    return (
      <div className="flex flex-col items-center rounded-2xl border border-line py-8 text-center text-sm text-muted">
        <Database size={18} className="mb-2 text-faint" />
        No data yet. Upload a file or load a demo dataset.
      </div>
    )
  return (
    <ul className="space-y-2">
      {props.sources.map((s) => {
        const on = props.selected.includes(s.id)
        const rows = s.tables.reduce((a, t) => a + t.rows.length, 0)
        return (
          <li
            key={s.id}
            onClick={() => props.onPreview(s.id)}
            className={`fade-up flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
              props.previewId === s.id ? 'border-line-2 bg-panel-2' : 'border-line hover:border-line-2'
            }`}
          >
            {s.account?.avatar ? (
              <img src={s.account.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-lg border border-line-2 object-cover" />
            ) : (
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2 ${s.format === 'json' ? 'text-amber-300' : 'text-emerald-300'}`}>
                <SourceIcon s={s} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium">{s.fileName}</span>
                {s.sample && <span className="rounded border border-line-2 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted">Demo data</span>}
                {s.connector &&
                  (props.connected?.includes(s.connector) ? (
                    <span className="rounded border border-emerald-400/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-emerald-300 light:text-emerald-700">Live · {s.connector}</span>
                  ) : (
                    <span className="rounded border border-amber-400/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-amber-300 light:text-amber-700" title="This is a saved snapshot; the account is no longer connected">
                      Snapshot · disconnected
                    </span>
                  ))}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                <CheckCircle2 size={11} className="text-emerald-400" />
                {s.connector ? 'Synced' : 'Parsed'} · {formatBytes(s.size)} · {s.tables.length} table{s.tables.length > 1 ? 's' : ''} · {rows} rows
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted" onClick={(e) => e.stopPropagation()} title="Use this source when generating">
              <input type="checkbox" checked={on} onChange={() => props.onToggle(s.id)} className="accent-[var(--accent)]" />
              Use
            </label>
            <button
              className="btn btn-ghost !p-1.5"
              aria-label={`Remove ${s.fileName}`}
              onClick={(e) => {
                e.stopPropagation()
                props.onRemove(s.id)
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
