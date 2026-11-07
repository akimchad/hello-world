import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Link2, Loader2, LogOut, RefreshCw } from 'lucide-react'
import type { DataSource } from '../types'
import type { IntegrationStatus, ProviderId } from '../lib/integrations'

export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function YouTubeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#FF0033" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8z" />
      <path fill="#fff" d="M9.6 15.6 15.8 12 9.6 8.4z" />
    </svg>
  )
}

const META: Record<ProviderId, { mark: React.ReactNode; blurb: string; gets: string }> = {
  github: { mark: <GitHubMark />, blurb: 'Repositories, languages and recent activity', gets: 'Profile · repositories · languages · public activity' },
  youtube: { mark: <YouTubeMark />, blurb: 'Channel, uploads, playlists and subscriptions', gets: 'Channel · uploads & stats · playlists · subscriptions (read-only)' },
}

export type BusyState = Partial<Record<ProviderId, 'connect' | 'disconnect' | 'sync' | undefined>>

function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

export function ConnectedAccounts(props: {
  integrations: IntegrationStatus[] | null
  loadError: string | null
  busy: BusyState
  errors: Partial<Record<ProviderId, string>>
  sources: DataSource[]
  onConnect: (p: ProviderId) => void
  onDisconnect: (p: ProviderId) => void
  onSync: (p: ProviderId) => void
  onRetry: () => void
  onBuild: (p: ProviderId) => void
}) {
  if (props.loadError)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[12.5px] text-red-400">
        <span className="flex items-center gap-2">
          <AlertTriangle size={14} /> {props.loadError}
        </span>
        <button className="btn !py-1 !text-[12px]" onClick={props.onRetry}>
          Retry
        </button>
      </div>
    )
  if (!props.integrations)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card h-[132px] overflow-hidden">
            <div className="shimmer h-full w-full" />
          </div>
        ))}
      </div>
    )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {props.integrations.map((it) => {
        const busy = props.busy[it.provider]
        const err = props.errors[it.provider]
        const synced = props.sources.find((s) => s.connector === it.provider)
        const rows = synced?.tables.reduce((a, t) => a + t.rows.length, 0) ?? 0
        return (
          <div key={it.provider} className="card fade-up flex flex-col p-4" data-testid={`integration-${it.provider}`}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-2 bg-panel-2">{META[it.provider].mark}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium">{it.label}</span>
                  {it.connected ? (
                    <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-px text-[10.5px] text-emerald-300 light:text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Connected
                    </span>
                  ) : it.configured ? (
                    <span className="rounded-full border border-line-2 px-2 py-px text-[10.5px] text-muted">Not connected</span>
                  ) : (
                    <span className="rounded-full border border-amber-400/30 px-2 py-px text-[10.5px] text-amber-300 light:text-amber-700">Setup required</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-muted">{META[it.provider].blurb}</p>
              </div>
            </div>

            {it.connected && it.account ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-bg-2/60 px-3 py-2.5">
                {it.account.avatar ? (
                  <img src={it.account.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full border border-line-2 object-cover" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full border border-line-2 bg-panel-2 text-[13px] font-medium">{it.account.name.slice(0, 1)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{it.account.name}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {it.account.handle && <span>{it.provider === 'github' ? '@' : ''}{it.account.handle} · </span>}
                    {synced ? `${rows} records synced ${ago(synced.uploadedAt)}` : busy === 'sync' ? 'Syncing…' : 'Not synced yet'}
                  </div>
                </div>
                {it.account.url && (
                  <a href={it.account.url} target="_blank" rel="noreferrer" className="text-faint hover:text-fg" aria-label={`Open ${it.label} profile`}>
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ) : !it.configured ? (
              <div className="mt-3 rounded-xl border border-dashed border-line-2 px-3 py-2.5 text-[11.5px] text-muted">
                <div className="flex items-center gap-1.5 text-fg/80">
                  <KeyRound size={12} /> Add {it.missing.map((m) => <code key={m} className="mx-0.5 rounded bg-fg/10 px-1 font-mono text-[10.5px]">{m}</code>)} to <code className="rounded bg-fg/10 px-1 font-mono text-[10.5px]">remix/.env.local</code>
                </div>
                <div className="mt-1 break-all">Redirect URI: <span className="font-mono text-[10.5px] text-fg/70">{it.redirectUri}</span></div>
              </div>
            ) : (
              <div className="mt-3 text-[11.5px] text-muted">Reads: {META[it.provider].gets}</div>
            )}

            {err && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-400" role="alert">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {err}
              </div>
            )}

            <div className="mt-auto flex items-center gap-2 pt-3">
              {it.connected ? (
                <>
                  <button className="btn !py-1.5 !text-[12px]" disabled={!!busy} onClick={() => props.onSync(it.provider)}>
                    {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {synced ? 'Sync again' : 'Sync data'}
                  </button>
                  <button className="btn btn-ghost !py-1.5 !text-[12px] hover:!text-red-400" disabled={!!busy} onClick={() => props.onDisconnect(it.provider)}>
                    {busy === 'disconnect' ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Disconnect
                  </button>
                  {synced && !busy && (
                    <button className="btn btn-primary ml-auto !py-1.5 !text-[12px]" onClick={() => props.onBuild(it.provider)}>
                      <CheckCircle2 size={13} /> Build an app
                    </button>
                  )}
                </>
              ) : (
                <button className="btn btn-primary !py-1.5 !text-[12px]" disabled={!it.configured || !!busy} onClick={() => props.onConnect(it.provider)}>
                  {busy === 'connect' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Connect {it.label}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
