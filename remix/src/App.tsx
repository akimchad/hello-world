import { useEffect, useRef, useState } from 'react'
import { Cpu, Moon, RotateCcw, ShieldCheck, Sparkles, Sun } from 'lucide-react'
import { useWorkspace } from './store'
import { Navbar } from './components/Navbar'
import { MainWorkspace, DataSection } from './components/MainWorkspace'
import { GenerationLoader, STAGES } from './components/GenerationLoader'
import { GeneratedDashboard } from './components/GeneratedDashboard'
import { MyApps } from './components/MyApps'
import { buildSource } from './lib/parse'
import { SAMPLES } from './lib/samples'
import { describeTables, generateLocal, sanitizeSpec } from './lib/engine'
import type { AppSpec, DataSource } from './types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function App() {
  const [s, a] = useWorkspace()
  const [ai, setAi] = useState<boolean | null>(null)
  const [gen, setGen] = useState<{ stage: number; prompt: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>(0)

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((j) => setAi(Boolean(j.ai)))
      .catch(() => setAi(false))
  }, [])

  const notify = (m: string) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3800)
  }

  const nav = (v: typeof s.view) => {
    a.set({ view: v })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadSample = (key: string, withPrompt?: boolean) => {
    const sample = SAMPLES.find((x) => x.key === key)!
    let src = s.sources.find((x) => x.sample && x.fileName === sample.fileName)
    if (!src) {
      src = buildSource(sample.fileName, sample.make(), true)
      a.addSource(src)
    }
    const id = src.id
    if (withPrompt) {
      a.set({ prompt: sample.prompt, selected: [id] })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      notify(`Loaded demo dataset ${sample.fileName} and a starter prompt`)
    } else a.set((st) => ({ selected: [...new Set([id, ...st.selected])] }))
  }

  const generate = async (prompt: string, sources: DataSource[], replaceId?: string) => {
    if (!sources.length) return notify('Attach at least one data source first')
    setGen({ stage: 0, prompt })
    const timer = window.setInterval(() => setGen((g) => (g && g.stage < STAGES.length - 2 ? { ...g, stage: g.stage + 1 } : g)), 750)
    const minWait = sleep(STAGES.length * 700)
    const local = generateLocal(prompt, sources)
    let spec: AppSpec = local
    let fallbackNote: string | null = null
    if (ai) {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, tables: describeTables(sources) }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
        spec = sanitizeSpec(j.spec, sources, prompt, local)
      } catch (e) {
        fallbackNote = `Claude request failed (${e instanceof Error ? e.message : 'error'}). Built with the local engine instead.`
      }
    }
    await minWait
    clearInterval(timer)
    setGen((g) => g && { ...g, stage: STAGES.length - 1 })
    await sleep(550)
    if (replaceId) {
      const prev = s.apps.find((x) => x.id === replaceId)
      if (prev) spec = { ...spec, id: prev.id, layout: prev.layout, accent: prev.accent, createdAt: prev.createdAt, title: prompt === prev.prompt ? prev.title : spec.title }
    }
    a.saveApp(spec)
    setGen(null)
    window.scrollTo({ top: 0 })
    if (fallbackNote) notify(fallbackNote)
  }

  const selected = s.sources.filter((x) => s.selected.includes(x.id))
  const activeApp = s.apps.find((x) => x.id === s.activeApp)

  const reset = () => {
    if (confirm('Reset workspace? This removes all uploaded data and generated apps from this browser.')) {
      a.reset()
      notify('Workspace reset')
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar
        view={s.view}
        onNav={nav}
        appCount={s.apps.length}
        sourceCount={s.sources.length}
        ai={ai}
        theme={s.theme}
        onTheme={() => a.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })}
        onReset={reset}
      />

      {s.view === 'workspace' && (
        <MainWorkspace
          prompt={s.prompt}
          setPrompt={(v) => a.set({ prompt: v })}
          sources={s.sources}
          selected={s.selected}
          apps={s.apps}
          ai={ai}
          onAdd={(src) => {
            a.addSource(src)
            notify(`Imported ${src.fileName} · ${src.tables.reduce((n, t) => n + t.rows.length, 0)} rows`)
          }}
          onRemove={a.removeSource}
          onToggle={a.toggleSelected}
          onLoadSample={loadSample}
          onGenerate={() => generate(s.prompt, selected)}
          onOpenApp={a.openApp}
          onDeleteApp={a.deleteApp}
          onAllApps={() => nav('apps')}
        />
      )}

      {s.view === 'app' && activeApp && (
        <GeneratedDashboard
          key={activeApp.id + activeApp.createdAt}
          app={activeApp}
          sources={s.sources}
          theme={s.theme}
          onTheme={(t) => a.set({ theme: t })}
          onUpdate={(patch) => a.updateApp(activeApp.id, patch)}
          onRegenerate={(p) => generate(p, s.sources.filter((x) => activeApp.sourceIds.includes(x.id)), activeApp.id)}
          onBack={() => nav('workspace')}
          onDelete={() => {
            a.deleteApp(activeApp.id)
            notify(`Deleted ${activeApp.title}`)
          }}
        />
      )}

      {s.view === 'apps' && <MyApps apps={s.apps} onOpen={a.openApp} onDelete={a.deleteApp} onNew={() => nav('workspace')} />}

      {s.view === 'data' && (
        <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">Data Sources</h1>
          <p className="mb-6 text-[13px] text-muted">Upload JSON or CSV exports. Everything is parsed in your browser; tick “Use” to include a source in your next app.</p>
          <DataSection
            sources={s.sources}
            selected={s.selected}
            onAdd={(src) => {
              a.addSource(src)
              notify(`Imported ${src.fileName}`)
            }}
            onRemove={a.removeSource}
            onToggle={a.toggleSelected}
            onLoadSample={(k) => loadSample(k)}
          />
        </div>
      )}

      {s.view === 'settings' && (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
          <div className="card divide-y divide-line">
            <div className="flex items-start gap-4 p-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2">{ai ? <Sparkles size={16} className="text-accent" /> : <Cpu size={16} />}</div>
              <div className="flex-1">
                <div className="font-medium">Generation engine</div>
                <p className="mt-1 text-[13px] text-muted">
                  {ai
                    ? 'Claude (claude-opus-5-5) is connected through the server-side /api/generate endpoint. Your API key never reaches the browser; the model returns a JSON spec that REMIX validates and renders with built-in components.'
                    : 'No API key configured, so REMIX uses its local rule-based engine: it profiles your real data and maps your prompt to components. Add ANTHROPIC_API_KEY to remix/.env.local and restart the dev server to generate with Claude.'}
                </p>
              </div>
              <span className={`chip ${ai ? '!text-accent' : ''}`}>{ai ? 'Connected' : 'Local'}</span>
            </div>
            <div className="flex items-center gap-4 p-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2">{s.theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}</div>
              <div className="flex-1">
                <div className="font-medium">Appearance</div>
                <p className="text-[13px] text-muted">Applies to the workspace and every app.</p>
              </div>
              <div className="flex gap-1 rounded-lg border border-line-2 p-1">
                {(['dark', 'light'] as const).map((t) => (
                  <button key={t} onClick={() => a.set({ theme: t })} className={`rounded-md px-3 py-1 text-[12.5px] capitalize ${s.theme === t ? 'bg-fg/10' : 'text-muted'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-4 p-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2">
                <ShieldCheck size={16} />
              </div>
              <div className="flex-1">
                <div className="font-medium">Privacy</div>
                <p className="mt-1 text-[13px] text-muted">
                  Data and apps live in this browser's local storage. When Claude is enabled, only field names, types, a few sample values and three sample rows per table are sent to the server to design your app. AI output is never executed as code.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-red-500/30 text-red-400">
                <RotateCcw size={16} />
              </div>
              <div className="flex-1">
                <div className="font-medium">Reset workspace</div>
                <p className="text-[13px] text-muted">
                  {s.sources.length} data sources · {s.apps.length} apps stored
                </p>
              </div>
              <button className="btn !border-red-500/30 !text-red-400 hover:!bg-red-500/10" onClick={reset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {gen && <GenerationLoader stage={gen.stage} prompt={gen.prompt} engine={ai ? 'Claude · claude-opus-5-5' : 'REMIX local engine'} />}

      {toast && (
        <div className="fade-up fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line-2 bg-panel px-4 py-2.5 text-[13px] shadow-2xl" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
