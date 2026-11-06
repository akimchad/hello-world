import { useState } from 'react'
import { ArrowRight, BookOpen, Clapperboard, Download, Layers, Terminal } from 'lucide-react'
import type { AppSpec, DataSource } from '../types'
import { SAMPLES } from '../lib/samples'
import { PromptInput } from './PromptInput'
import { DataUploader, SourceList } from './DataUploader'
import { DataPreview } from './DataPreview'
import { AppCard } from './MyApps'

const SAMPLE_ICON = { github: Terminal, student: BookOpen, creator: Clapperboard } as const

export function downloadSample(key: string) {
  const s = SAMPLES.find((x) => x.key === key)!
  const blob = new Blob([s.make()], { type: s.fileName.endsWith('.json') ? 'application/json' : 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = s.fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function DataSection(props: {
  sources: DataSource[]
  selected: string[]
  onAdd: (s: DataSource) => void
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onLoadSample: (key: string) => void
}) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = props.sources.find((s) => s.id === previewId) ?? props.sources[0]
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-4">
        <DataUploader onAdd={props.onAdd} compact />
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>Demo datasets:</span>
          {SAMPLES.map((s) => (
            <span key={s.key} className="chip !pr-1">
              <button className="hover:text-fg" onClick={() => props.onLoadSample(s.key)}>
                {s.fileName}
              </button>
              <button className="rounded-full p-1 hover:bg-fg/10 hover:text-fg" title="Download file to try the upload flow" onClick={() => downloadSample(s.key)}>
                <Download size={11} />
              </button>
            </span>
          ))}
        </div>
        <SourceList sources={props.sources} selected={props.selected} previewId={preview?.id ?? null} onToggle={props.onToggle} onRemove={props.onRemove} onPreview={setPreviewId} />
      </div>
      <DataPreview key={preview?.id} source={preview} />
    </div>
  )
}

export function MainWorkspace(props: {
  prompt: string
  setPrompt: (v: string) => void
  sources: DataSource[]
  selected: string[]
  apps: AppSpec[]
  ai: boolean | null
  onAdd: (s: DataSource) => void
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onLoadSample: (key: string, withPrompt?: boolean) => void
  onGenerate: () => void
  onOpenApp: (id: string) => void
  onDeleteApp: (id: string) => void
  onAllApps: () => void
}) {
  const attached = props.sources.filter((s) => props.selected.includes(s.id))
  return (
    <div className="relative">
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <section className="relative mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:pt-24">
        <div className="fade-up chip mx-auto mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Your data. Your interface. Your rules.
        </div>
        <h1 className="fade-up text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-[56px] sm:leading-[1.05]" style={{ animationDelay: '60ms' }}>
          <span className="text-fg">Software should work the way </span>
          <span className="bg-gradient-to-b from-accent to-accent/60 bg-clip-text text-transparent">you</span>
          <span className="text-muted"> think.</span>
        </h1>
        <p className="fade-up mx-auto mt-4 max-w-xl text-[15px] text-muted" style={{ animationDelay: '120ms' }}>
          Bring your data. Describe your vision. Build your own software.
        </p>
        <div className="fade-up mt-9 text-left" style={{ animationDelay: '180ms' }}>
          <PromptInput
            value={props.prompt}
            onChange={props.setPrompt}
            attached={attached}
            onDetach={props.onToggle}
            onAdd={props.onAdd}
            onGenerate={props.onGenerate}
            ai={props.ai}
          />
        </div>
        <div className="fade-up mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint" style={{ animationDelay: '240ms' }}>
          {['Describe', 'Generate', 'Customize', 'Use'].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="text-accent/80">0{i + 1}</span> {s}
              {i < 3 && <ArrowRight size={11} className="ml-4 hidden sm:block" />}
            </span>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Start from an example</h2>
            <p className="text-[13px] text-muted">Loads a clearly-labeled demo dataset and a starter prompt. Then hit Generate.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {SAMPLES.map((s, i) => {
            const Icon = SAMPLE_ICON[s.key]
            return (
              <button
                key={s.key}
                onClick={() => props.onLoadSample(s.key, true)}
                className="card fade-up group p-4 text-left transition hover:-translate-y-0.5 hover:border-line-2"
                style={{ animationDelay: `${280 + i * 60}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-full border border-line-2 bg-panel-2">
                    <Icon size={16} className="text-fg/80" />
                  </div>
                  <span className="rounded-md border border-line-2 px-2 py-0.5 text-[10px] text-muted">{s.fileName.endsWith('.json') ? 'JSON' : 'CSV'} · demo</span>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[14px] font-medium">
                  {s.appName} <span className="text-accent">✦</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{s.prompt}</p>
                <div className="mt-3 flex items-center gap-1 text-[12px] text-muted transition group-hover:text-fg">
                  Use this example <ArrowRight size={12} />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="relative mx-auto mt-14 max-w-[1240px] px-4 sm:px-6">
        <div className="mb-4 flex items-center gap-2">
          <Layers size={16} className="text-muted" />
          <h2 className="text-lg font-medium tracking-tight">Your data</h2>
          <span className="text-[13px] text-muted">— parsed locally in your browser</span>
        </div>
        <DataSection sources={props.sources} selected={props.selected} onAdd={props.onAdd} onRemove={props.onRemove} onToggle={props.onToggle} onLoadSample={(k) => props.onLoadSample(k)} />
      </section>

      {props.apps.length > 0 && (
        <section className="relative mx-auto mt-14 max-w-[1240px] px-4 sm:px-6">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-lg font-medium tracking-tight">Recent apps</h2>
            <button className="btn btn-ghost !text-[12px]" onClick={props.onAllApps}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {props.apps.slice(0, 3).map((a) => (
              <AppCard key={a.id} app={a} onOpen={() => props.onOpenApp(a.id)} onDelete={() => props.onDeleteApp(a.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
