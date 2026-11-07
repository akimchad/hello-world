import { useCallback, useEffect, useState } from 'react'
import type { AppSpec, DataSource, View } from './types'
import { profileRows } from './lib/parse'

interface Persisted {
  sources: DataSource[]
  apps: AppSpec[]
  selected: string[]
  activeApp: string | null
  view: View
  theme: 'dark' | 'light'
  prompt: string
}

const KEY = 'remix:workspace:v1'
const EMPTY: Persisted = { sources: [], apps: [], selected: [], activeApp: null, view: 'workspace', theme: 'dark', prompt: '' }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const p = { ...EMPTY, ...JSON.parse(raw) } as Persisted
    // re-profile in case the profiler improved since this was saved
    p.sources = p.sources.map((s) => ({ ...s, tables: s.tables.map((t) => ({ ...t, fields: profileRows(t.rows) })) }))
    if (p.view === 'app' && !p.apps.some((a) => a.id === p.activeApp)) p.view = 'workspace'
    return p
  } catch {
    return EMPTY
  }
}

export function useWorkspace() {
  const [state, setState] = useState<Persisted>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage full or blocked: workspace still works in-memory */
    }
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  const set = useCallback((patch: Partial<Persisted> | ((s: Persisted) => Partial<Persisted>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  }, [])

  const actions = {
    set,
    addSource: (src: DataSource) => set((s) => ({ sources: [src, ...s.sources], selected: [...new Set([src.id, ...s.selected])] })),
    /** Insert or replace (same id) — used when re-syncing a connected account so existing apps keep working. */
    upsertSource: (src: DataSource) =>
      set((s) => ({
        sources: s.sources.some((x) => x.id === src.id) ? s.sources.map((x) => (x.id === src.id ? src : x)) : [src, ...s.sources],
        selected: [...new Set([src.id, ...s.selected])],
      })),
    removeConnectorSources: (connector: 'github' | 'youtube') =>
      set((s) => {
        const gone = new Set(s.sources.filter((x) => x.connector === connector).map((x) => x.id))
        return { sources: s.sources.filter((x) => !gone.has(x.id)), selected: s.selected.filter((x) => !gone.has(x)) }
      }),
    removeSource: (id: string) => set((s) => ({ sources: s.sources.filter((x) => x.id !== id), selected: s.selected.filter((x) => x !== id) })),
    toggleTable: (id: string, table: string) =>
      set((s) => ({
        sources: s.sources.map((x) => {
          if (x.id !== id) return x
          const ex = new Set(x.excludedTables ?? [])
          if (ex.has(table)) ex.delete(table)
          else if (ex.size < x.tables.length - 1) ex.add(table) // keep at least one dataset
          return { ...x, excludedTables: [...ex] }
        }),
      })),
    toggleSelected: (id: string) => set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
    saveApp: (app: AppSpec) => set((s) => ({ apps: [app, ...s.apps.filter((a) => a.id !== app.id)], activeApp: app.id, view: 'app' })),
    updateApp: (id: string, patch: Partial<AppSpec> | ((a: AppSpec) => Partial<AppSpec>)) =>
      set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a)) })),
    deleteApp: (id: string) => set((s) => ({ apps: s.apps.filter((a) => a.id !== id), activeApp: s.activeApp === id ? null : s.activeApp, view: s.view === 'app' && s.activeApp === id ? 'apps' : s.view })),
    openApp: (id: string) => set({ activeApp: id, view: 'app' }),
    reset: () => {
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
      setState({ ...EMPTY, theme: state.theme })
    },
  }
  return [state, actions] as const
}

export type Actions = ReturnType<typeof useWorkspace>[1]
export type WorkspaceState = ReturnType<typeof useWorkspace>[0]
