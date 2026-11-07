import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

export const STAGES = ['Analyzing your data', 'Understanding your request', 'Designing your interface', 'Building your application', 'Your application is ready']

export function GenerationLoader({ stage, prompt, engine, startedAt, note }: { stage: number; prompt: string; engine: string; startedAt: number; note?: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [])
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 px-4 backdrop-blur-md">
      <div className="card fade-up w-full max-w-md overflow-hidden">
        <div className="relative h-36 overflow-hidden border-b border-line">
          <div className="glow-top absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-20 w-20">
              <div className="spin-slow absolute inset-0 rounded-full border border-dashed border-accent/40" />
              <div className="absolute inset-3 rounded-full border border-line-2 bg-panel-2" />
              <div className="absolute inset-0 grid place-items-center">
                <svg width="30" height="30" viewBox="0 0 32 32">
                  <path d="M10 22V10h6.5a4 4 0 0 1 0 8H10m6.5 0 5 4" stroke="var(--accent)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
          <div className="shimmer absolute inset-0" />
        </div>
        <div className="p-5">
          <p className="line-clamp-2 text-[13px] italic text-muted">“{prompt}”</p>
          {note && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-accent">
              <Loader2 size={12} className="animate-spin" /> {note}
            </p>
          )}
          <ul className="mt-4 space-y-2.5">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-[13px] transition ${i <= stage ? 'text-fg' : 'text-faint'}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full border ${i < stage || stage === STAGES.length - 1 ? 'border-accent bg-accent text-accent-ink' : i === stage ? 'border-accent' : 'border-line-2'}`}>
                  {i < stage || stage === STAGES.length - 1 ? <Check size={11} strokeWidth={3} /> : i === stage ? <Loader2 size={11} className="animate-spin text-accent" /> : null}
                </span>
                {s}
                {i === stage && stage < STAGES.length - 1 ? '…' : ''}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-faint">
            <span>
              {engine} · {secs}s
            </span>
            <span>{Math.round(((stage + 1) / STAGES.length) * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fg/10">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
