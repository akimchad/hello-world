import { useEffect, useRef, useState } from 'react'
import { Cpu, Moon, RotateCcw, Settings, Sparkles, Sun } from 'lucide-react'
import type { View } from '../types'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--panel-2)" stroke="var(--line-2)" />
        <path d="M10 22V10h6.5a4 4 0 0 1 0 8H10m6.5 0 5 4" stroke="var(--accent)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[15px] font-medium tracking-[0.22em]">REMIX</span>
    </div>
  )
}

export function Navbar(props: {
  view: View
  onNav: (v: View) => void
  appCount: number
  sourceCount: number
  ai: boolean | null
  theme: 'dark' | 'light'
  onTheme: () => void
  onReset: () => void
}) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const items: { v: View; label: string; n?: number }[] = [
    { v: 'workspace', label: 'Workspace' },
    { v: 'apps', label: 'My Apps', n: props.appCount },
    { v: 'data', label: 'Data Sources', n: props.sourceCount },
    { v: 'settings', label: 'Settings' },
  ]
  const active = props.view === 'app' ? 'apps' : props.view
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
        <button onClick={() => props.onNav('workspace')} className="shrink-0">
          <Logo />
        </button>
        <nav className="hidden items-center gap-1 rounded-full border border-line bg-panel/60 p-1 md:flex">
          {items.map((it) => (
            <button
              key={it.v}
              onClick={() => props.onNav(it.v)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition ${
                active === it.v ? 'bg-panel-2 text-fg shadow-[inset_0_0_0_1px_var(--line-2)]' : 'text-muted hover:text-fg'
              }`}
            >
              {it.label}
              {!!it.n && <span className="rounded-full bg-fg/10 px-1.5 font-mono text-[10px] text-muted">{it.n}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {props.ai !== null && (
            <span className="chip hidden sm:inline-flex" title={props.ai ? 'Generation runs on Claude via a server-side endpoint' : 'No API key configured — using the local rule-based engine'}>
              {props.ai ? <Sparkles size={12} className="text-accent" /> : <Cpu size={12} />}
              {props.ai ? 'Claude connected' : 'Local engine'}
            </span>
          )}
          <button className="btn btn-ghost !px-2" onClick={props.onTheme} aria-label="Toggle theme">
            {props.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="relative" ref={ref}>
            <button
              onClick={() => setMenu((m) => !m)}
              className="grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-gradient-to-br from-panel-2 to-bg text-[12px] font-semibold"
              aria-label="Profile"
            >
              Y
            </button>
            {menu && (
              <div className="card fade-up absolute right-0 mt-2 w-56 p-1.5 text-[13px]">
                <div className="px-3 py-2">
                  <div className="font-medium">Your workspace</div>
                  <div className="text-xs text-muted">Stored locally in this browser</div>
                </div>
                <div className="my-1 h-px bg-line" />
                <div className="md:hidden">
                  {items.map((it) => (
                    <button key={it.v} onClick={() => (props.onNav(it.v), setMenu(false))} className="w-full rounded-lg px-3 py-2 text-left hover:bg-fg/5">
                      {it.label}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-line" />
                </div>
                <button onClick={() => (props.onNav('settings'), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-fg/5">
                  <Settings size={14} /> Settings
                </button>
                <button onClick={() => (props.onReset(), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-400 hover:bg-red-500/10">
                  <RotateCcw size={14} /> Reset workspace
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
