// Browser-side client for the server's integration endpoints. No tokens ever pass through here.
export type ProviderId = 'github' | 'youtube'

export interface IntegrationStatus {
  provider: ProviderId
  label: string
  configured: boolean
  missing: string[]
  redirectUri: string
  connected: boolean
  account: { id: string; name: string; handle?: string; avatar?: string; url?: string } | null
  connectedAt: number | null
  scopes: string | null
}

export async function fetchIntegrations(): Promise<{ integrations: IntegrationStatus[]; devSecret: boolean }> {
  const r = await fetch('/api/integrations', { credentials: 'same-origin' })
  if (!r.ok) throw new Error(`Could not load integrations (HTTP ${r.status})`)
  return r.json()
}

export const startConnect = (p: ProviderId) => {
  window.location.href = `/api/auth/${p}/start`
}

export async function disconnect(p: ProviderId) {
  const r = await fetch(`/api/integrations/${p}/disconnect`, { method: 'POST', credentials: 'same-origin' })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`)
}

export class SyncError extends Error {
  constructor(
    message: string,
    public disconnected = false,
  ) {
    super(message)
  }
}

export async function fetchConnectedData(p: ProviderId) {
  const r = await fetch(`/api/integrations/${p}/data`, { credentials: 'same-origin' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new SyncError(j.error ?? `HTTP ${r.status}`, Boolean(j.disconnected) || r.status === 401)
  return j as { provider: ProviderId; account: { name: string; handle?: string; avatar?: string }; fileName: string; data: unknown; warnings?: string[]; fetchedAt: number }
}
