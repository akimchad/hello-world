import { ArrowUpRight, Cpu, LayoutGrid, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { AppSpec } from '../types'

export function AppCard({ app, onOpen, onDelete }: { app: AppSpec; onOpen: () => void; onDelete: () => void }) {
  const visible = app.widgets.filter((w) => w.visible)
  return (
    <div className="card group fade-up relative overflow-hidden p-4" style={{ ['--accent' as string]: app.accent }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
      <div className="flex items-start justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-line-2 bg-panel-2">
          <LayoutGrid size={16} className="text-accent" />
        </div>
        <button className="btn btn-ghost !p-1.5 opacity-60 hover:opacity-100" onClick={onDelete} aria-label={`Delete ${app.title}`}>
          <Trash2 size={14} />
        </button>
      </div>
      <button onClick={onOpen} className="mt-3 block w-full text-left">
        <div className="flex items-center gap-1.5 font-medium">
          {app.title}
          <ArrowUpRight size={14} className="text-muted transition group-hover:text-fg" />
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{app.prompt}</p>
        {/* mini layout thumbnail */}
        <div className="mt-3 grid grid-cols-4 gap-1">
          {visible.slice(0, 8).map((w) => (
            <div key={w.id} className={`h-3 rounded-sm ${w.type === 'stat' ? 'bg-accent/40' : 'bg-fg/10'}`} style={{ gridColumn: `span ${Math.min(w.size, 4)}` }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            {app.engine === 'claude' ? <Sparkles size={11} /> : <Cpu size={11} />}
            {app.engine === 'claude' ? 'Claude' : 'Local engine'}
          </span>
          <span>{visible.length} widgets</span>
          <span>{new Date(app.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </button>
    </div>
  )
}

export function MyApps({ apps, onOpen, onDelete, onNew }: { apps: AppSpec[]; onOpen: (id: string) => void; onDelete: (id: string) => void; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Apps</h1>
          <p className="text-[13px] text-muted">Every app you generate is saved here, with your customizations.</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New app
        </button>
      </div>
      {apps.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <AppCard key={a.id} app={a} onOpen={() => onOpen(a.id)} onDelete={() => onDelete(a.id)} />
          ))}
        </div>
      ) : (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <LayoutGrid size={22} className="mb-3 text-faint" />
          <div className="font-medium">No apps yet</div>
          <p className="mt-1 max-w-sm text-[13px] text-muted">Describe the software you want in the workspace and REMIX will build it from your data.</p>
          <button className="btn btn-primary mt-5" onClick={onNew}>
            Build your first app
          </button>
        </div>
      )}
    </div>
  )
}
