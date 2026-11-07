import { useRef } from 'react'
import { ArrowUp, Cpu, Paperclip, Sparkles, X } from 'lucide-react'
import type { DataSource } from '../types'
import { useFileImport } from './DataUploader'
import { DataPicker, SourceBadge, sourceLabel } from './DataPicker'

export function PromptInput(props: {
  value: string
  onChange: (v: string) => void
  attached: DataSource[]
  onDetach: (id: string) => void
  onAdd: (s: DataSource) => void
  onGenerate: () => void
  ai: boolean | null
  allSources: DataSource[]
  selected: string[]
  connected: string[]
  onToggleSource: (id: string) => void
  onToggleTable: (id: string, table: string) => void
  onManageData: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { importFiles, error } = useFileImport(props.onAdd)
  const ready = props.value.trim().length > 3 && props.attached.length > 0
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-px rounded-[22px] bg-gradient-to-b from-fg/15 via-fg/5 to-transparent" />
      <div className="relative rounded-[21px] border border-line bg-panel/90 p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <label htmlFor="prompt" className="text-[13px] font-medium text-fg">
            What do you want to build?
          </label>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            {props.ai ? <Sparkles size={12} className="text-accent" /> : <Cpu size={12} className="text-accent" />}
            {props.ai ? 'AI-powered · Claude' : 'AI-ready · local engine'}
          </span>
        </div>
        <textarea
          id="prompt"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ready) props.onGenerate()
          }}
          rows={4}
          placeholder="Create a developer dashboard showing my GitHub projects, coding activity, favorite tutorials, and learning goals..."
          className="w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-fg outline-none placeholder:text-faint"
        />
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5">
          <button className="btn !py-1.5 !text-[12px]" onClick={() => fileRef.current?.click()}>
            <Paperclip size={13} /> Upload data
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) importFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <DataPicker
            sources={props.allSources}
            selected={props.selected}
            connected={props.connected}
            onToggleSource={props.onToggleSource}
            onToggleTable={props.onToggleTable}
            onManage={props.onManageData}
          />
          {props.attached.map((s) => (
            <span key={s.id} className="chip fade-up !text-fg" title={s.tables.filter((t) => !s.excludedTables?.includes(t.name)).map((t) => t.name).join(', ')}>
              <SourceBadge s={s} size={13} />
              <span className="max-w-[180px] truncate">{sourceLabel(s)}</span>
              {s.tables.length > 1 && (
                <span className="font-mono text-[10px] text-muted">
                  {s.tables.length - (s.excludedTables?.length ?? 0)}/{s.tables.length}
                </span>
              )}
              <button onClick={() => props.onDetach(s.id)} className="text-muted hover:text-fg" aria-label={`Detach ${s.fileName}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          {!props.attached.length && <span className="text-[12px] text-faint">No data attached — choose data, upload a file, or pick an example below</span>}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[10px] text-faint sm:inline">⌘ ↵</span>
            <button className="btn btn-primary !rounded-xl !px-4" disabled={!ready} onClick={props.onGenerate}>
              Generate <ArrowUp size={15} />
            </button>
          </div>
        </div>
        {error && <div className="mx-2 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      </div>
    </div>
  )
}
