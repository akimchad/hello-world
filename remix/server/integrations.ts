// Real OAuth integrations for GitHub and YouTube (Google OAuth 2.0).
// Mounted into the Vite dev/preview server as Connect middleware. All secrets and tokens stay server-side.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { type Account, type Connection, type Provider, deleteConnection, getConnection, newSessionId, newState, setConnection, usingGeneratedSecret } from './tokenStore'

/* ---------------- config ---------------- */

const env = (k: string) => process.env[k]?.trim() || ''
const baseUrl = () => (env('REMIX_BASE_URL') || 'http://localhost:5180').replace(/\/$/, '')
const redirectUri = (p: Provider) => `${baseUrl()}/api/auth/${p}/callback`
const secureCookies = () => baseUrl().startsWith('https://')

const PROVIDERS: Record<Provider, { label: string; clientId: () => string; clientSecret: () => string; idVar: string; secretVar: string }> = {
  github: { label: 'GitHub', clientId: () => env('GITHUB_CLIENT_ID'), clientSecret: () => env('GITHUB_CLIENT_SECRET'), idVar: 'GITHUB_CLIENT_ID', secretVar: 'GITHUB_CLIENT_SECRET' },
  youtube: { label: 'YouTube', clientId: () => env('GOOGLE_CLIENT_ID'), clientSecret: () => env('GOOGLE_CLIENT_SECRET'), idVar: 'GOOGLE_CLIENT_ID', secretVar: 'GOOGLE_CLIENT_SECRET' },
}
const isProvider = (p: string): p is Provider => p === 'github' || p === 'youtube'
const configured = (p: Provider) => Boolean(PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret())

const GITHUB_SCOPES = () => (env('GITHUB_INCLUDE_PRIVATE') === 'true' ? 'read:user repo' : 'read:user')
// Read-only YouTube access is the only scope needed: channel, uploads, playlists and subscriptions.
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly'

/* ---------------- http helpers ---------------- */

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function cookie(name: string, value: string, maxAgeSec: number, path = '/') {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureCookies() ? '; Secure' : ''}`
}

function json(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string | string[]> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders })
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string, setCookies: string[] = []) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...(setCookies.length ? { 'set-cookie': setCookies } : {}) })
  res.end()
}

function sameState(a: string | null, b: string | undefined) {
  if (!a || !b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const backToApp = (params: Record<string, string>) => `${baseUrl()}/?${new URLSearchParams({ view: 'data', ...params })}`

/** Reject cross-site state-changing requests (cookies are SameSite=Lax, this is defense in depth). */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers.host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function fetchJson<T>(url: string, init: RequestInit & { what: string }): Promise<T> {
  const r = await fetch(url, init)
  const text = await r.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error page */
  }
  if (!r.ok) {
    const b = body as { message?: string; error?: { message?: string } | string; error_description?: string } | null
    const msg = (typeof b?.error === 'object' ? b.error?.message : b?.error_description || b?.error) || b?.message || `${r.status} ${r.statusText}`
    throw new HttpError(r.status === 401 || r.status === 403 ? r.status : 502, `${init.what}: ${msg}`)
  }
  return body as T
}

/* ---------------- GitHub ---------------- */

const GH_HEADERS = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'REMIX-app',
})

async function githubExchange(code: string): Promise<Connection> {
  const tok = await fetchJson<{ access_token?: string; scope?: string; error?: string; error_description?: string }>('https://github.com/login/oauth/access_token', {
    what: 'GitHub token exchange',
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: PROVIDERS.github.clientId(), client_secret: PROVIDERS.github.clientSecret(), code, redirect_uri: redirectUri('github') }),
  })
  // GitHub returns 200 with an error field for bad codes.
  if (!tok.access_token) throw new HttpError(400, `GitHub: ${tok.error_description || tok.error || 'no access token returned'}`)
  const u = await fetchJson<{ id: number; login: string; name: string | null; avatar_url: string; html_url: string }>('https://api.github.com/user', {
    what: 'GitHub profile',
    headers: GH_HEADERS(tok.access_token),
  })
  const account: Account = { id: String(u.id), name: u.name || u.login, handle: u.login, avatar: u.avatar_url, url: u.html_url }
  return { accessToken: tok.access_token, scope: tok.scope ?? '', account, connectedAt: Date.now() }
}

function describeEvent(e: { type: string; payload: Record<string, any> }): { type: string; message: string } {
  const p = e.payload ?? {}
  switch (e.type) {
    case 'PushEvent': {
      const first = Array.isArray(p.commits) && p.commits[0]?.message ? String(p.commits[0].message).split('\n')[0] : ''
      const branch = typeof p.ref === 'string' ? p.ref.replace('refs/heads/', '') : ''
      return { type: 'push', message: first || `Pushed to ${branch || 'a branch'}` }
    }
    case 'PullRequestEvent':
      return { type: 'pull_request', message: `${p.action ?? 'updated'} PR #${p.number ?? p.pull_request?.number ?? ''}${p.pull_request?.title ? `: ${p.pull_request.title}` : ''}` }
    case 'PullRequestReviewEvent':
      return { type: 'review', message: `Reviewed PR #${p.pull_request?.number ?? ''}${p.pull_request?.title ? `: ${p.pull_request.title}` : ''}` }
    case 'IssuesEvent':
      return { type: 'issue', message: `${p.action ?? 'updated'} issue #${p.issue?.number ?? ''}${p.issue?.title ? `: ${p.issue.title}` : ''}` }
    case 'IssueCommentEvent':
      return { type: 'comment', message: `Commented on #${p.issue?.number ?? ''}${p.issue?.title ? `: ${p.issue.title}` : ''}` }
    case 'CreateEvent':
      return { type: 'create', message: `Created ${p.ref_type ?? 'item'}${p.ref ? ` ${p.ref}` : ''}` }
    case 'DeleteEvent':
      return { type: 'delete', message: `Deleted ${p.ref_type ?? 'item'}${p.ref ? ` ${p.ref}` : ''}` }
    case 'ReleaseEvent':
      return { type: 'release', message: `Released ${p.release?.tag_name ?? ''}`.trim() }
    case 'WatchEvent':
      return { type: 'star', message: 'Starred repository' }
    case 'ForkEvent':
      return { type: 'fork', message: 'Forked repository' }
    default:
      return { type: e.type.replace(/Event$/, '').toLowerCase(), message: e.type.replace(/Event$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') }
  }
}

async function githubData(c: Connection) {
  const h = GH_HEADERS(c.accessToken)
  const [user, repos] = await Promise.all([
    fetchJson<Record<string, any>>('https://api.github.com/user', { what: 'GitHub profile', headers: h }),
    fetchJson<Record<string, any>[]>('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', { what: 'GitHub repositories', headers: h }),
  ])
  const events = await fetchJson<Record<string, any>[]>(`https://api.github.com/users/${encodeURIComponent(user.login)}/events?per_page=100`, { what: 'GitHub activity', headers: h }).catch(() => [])
  // Per-repo language breakdown for the 30 most recently updated repos (keeps API usage bounded).
  const langs = new Map<string, string[]>()
  await Promise.all(
    repos.slice(0, 30).map(async (r) => {
      try {
        const l = await fetchJson<Record<string, number>>(r.languages_url, { what: 'GitHub languages', headers: h })
        langs.set(r.full_name, Object.entries(l).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 4))
      } catch {
        /* skip a repo whose languages can't be read */
      }
    }),
  )
  const day = (s?: string) => (s ? s.slice(0, 10) : null)
  return {
    profile: {
      name: user.name || user.login,
      login: user.login,
      avatar: user.avatar_url,
      bio: user.bio ?? null,
      followers: user.followers,
      public_repos: user.public_repos,
      source: 'GitHub (live, via OAuth)',
    },
    repositories: repos.map((r) => ({
      name: r.name,
      description: r.description ?? '',
      language: r.language ?? 'None',
      languages: langs.get(r.full_name) ?? (r.language ? [r.language] : []),
      status: r.archived ? 'Archived' : r.fork ? 'Fork' : 'Original',
      visibility: r.private ? 'Private' : 'Public',
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      updated: day(r.pushed_at || r.updated_at),
      created: day(r.created_at),
      topics: r.topics ?? [],
      url: r.html_url,
    })),
    activity: events.map((e) => {
      const d = describeEvent(e as { type: string; payload: Record<string, any> })
      return { date: day(e.created_at), type: d.type, repo: String(e.repo?.name ?? '').split('/').pop(), message: d.message }
    }),
  }
}

async function githubRevoke(c: Connection) {
  // Deletes the OAuth grant so the token can no longer be used.
  const basic = Buffer.from(`${PROVIDERS.github.clientId()}:${PROVIDERS.github.clientSecret()}`).toString('base64')
  await fetch(`https://api.github.com/applications/${PROVIDERS.github.clientId()}/grant`, {
    method: 'DELETE',
    headers: { authorization: `Basic ${basic}`, accept: 'application/vnd.github+json', 'user-agent': 'REMIX-app', 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: c.accessToken }),
  }).catch(() => undefined)
}

/* ---------------- YouTube (Google OAuth 2.0) ---------------- */

type GoogleToken = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }

async function googleToken(params: Record<string, string>): Promise<GoogleToken> {
  return fetchJson<GoogleToken>('https://oauth2.googleapis.com/token', {
    what: 'Google token request',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: PROVIDERS.youtube.clientId(), client_secret: PROVIDERS.youtube.clientSecret(), ...params }),
  })
}

const yt = <T>(path: string, token: string, what: string) =>
  fetchJson<T>(`https://www.googleapis.com/youtube/v3/${path}`, { what, headers: { authorization: `Bearer ${token}` } })

async function youtubeExchange(code: string): Promise<Connection> {
  const tok = await googleToken({ code, grant_type: 'authorization_code', redirect_uri: redirectUri('youtube') })
  if (!tok.access_token) throw new HttpError(400, `Google: ${tok.error_description || tok.error || 'no access token returned'}`)
  if (!tok.scope?.includes('youtube.readonly')) {
    // The user unticked YouTube access on Google's consent screen: hand the token back and fail honestly.
    await revokeGoogleToken(tok.refresh_token || tok.access_token)
    throw new HttpError(403, 'YouTube access was not granted. Please allow “View your YouTube account” on the consent screen.')
  }
  const ch = await yt<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> } }[] }>('channels?part=snippet&mine=true', tok.access_token, 'YouTube channel')
  const c = ch.items?.[0]
  let account: Account
  if (c) {
    const t = c.snippet.thumbnails ?? {}
    account = { id: c.id, name: c.snippet.title, handle: c.snippet.customUrl, avatar: (t.medium ?? t.default ?? t.high)?.url, url: `https://www.youtube.com/channel/${c.id}` }
  } else {
    // Google account without a YouTube channel. Still a real, authorized connection (playlists/subscriptions may exist),
    // but there is no channel name or picture to show without requesting extra profile scopes.
    account = { id: `google-${Date.now()}`, name: 'Google account', handle: 'No YouTube channel' }
  }
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    scope: tok.scope ?? '',
    account,
    connectedAt: Date.now(),
  }
}

async function freshGoogleToken(sid: string, c: Connection): Promise<string> {
  if (c.expiresAt && c.expiresAt - Date.now() > 60_000) return c.accessToken
  if (!c.refreshToken) throw new HttpError(401, 'Your YouTube session expired. Please reconnect.')
  let tok: GoogleToken
  try {
    tok = await googleToken({ grant_type: 'refresh_token', refresh_token: c.refreshToken })
  } catch {
    // invalid_grant: the user revoked access or the refresh token expired.
    throw new HttpError(401, 'YouTube access was revoked or expired. Please reconnect.')
  }
  if (!tok.access_token) throw new HttpError(401, 'Could not refresh YouTube access. Please reconnect.')
  const next = { ...c, accessToken: tok.access_token, expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000 }
  setConnection(sid, 'youtube', next)
  return next.accessToken
}

const isoMinutes = (d?: string) => {
  const m = d?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  return Math.round(((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / 60) * 10) / 10
}

async function youtubeData(sid: string, c: Connection) {
  const token = await freshGoogleToken(sid, c)
  const ch = await yt<{ items?: Record<string, any>[] }>('channels?part=snippet,statistics,contentDetails&mine=true', token, 'YouTube channel')
  const channel = ch.items?.[0]
  const day = (s?: string) => (s ? s.slice(0, 10) : null)

  let videos: Record<string, unknown>[] = []
  const uploads = channel?.contentDetails?.relatedPlaylists?.uploads
  if (uploads) {
    const items = await yt<{ items?: { contentDetails: { videoId: string } }[] }>(`playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploads)}`, token, 'YouTube uploads').catch(() => ({ items: [] }))
    const ids = (items.items ?? []).map((i) => i.contentDetails.videoId).filter(Boolean)
    if (ids.length) {
      const v = await yt<{ items?: Record<string, any>[] }>(`videos?part=snippet,statistics,contentDetails,status&id=${ids.join(',')}`, token, 'YouTube videos')
      videos = (v.items ?? []).map((x) => ({
        title: x.snippet.title,
        published: day(x.snippet.publishedAt),
        status: x.status?.privacyStatus ? String(x.status.privacyStatus).replace(/^\w/, (s: string) => s.toUpperCase()) : 'Unknown',
        views: Number(x.statistics?.viewCount ?? 0),
        likes: Number(x.statistics?.likeCount ?? 0),
        comments: Number(x.statistics?.commentCount ?? 0),
        duration_min: isoMinutes(x.contentDetails?.duration),
        tags: (x.snippet.tags ?? []).slice(0, 5),
        description: String(x.snippet.description ?? '').split('\n')[0].slice(0, 200),
        url: `https://www.youtube.com/watch?v=${x.id}`,
      }))
    }
  }
  const pl = await yt<{ items?: Record<string, any>[] }>('playlists?part=snippet,contentDetails,status&mine=true&maxResults=50', token, 'YouTube playlists').catch(() => ({ items: [] }))
  const subs = await yt<{ items?: Record<string, any>[] }>('subscriptions?part=snippet&mine=true&maxResults=50&order=relevance', token, 'YouTube subscriptions').catch(() => ({ items: [] }))

  return {
    profile: {
      name: channel?.snippet?.title ?? c.account.name,
      handle: channel?.snippet?.customUrl ?? null,
      description: String(channel?.snippet?.description ?? '').slice(0, 300),
      country: channel?.snippet?.country ?? null,
      created: day(channel?.snippet?.publishedAt),
      avatar: channel?.snippet?.thumbnails?.medium?.url ?? channel?.snippet?.thumbnails?.default?.url ?? null,
      subscribers: channel?.statistics?.hiddenSubscriberCount ? null : Number(channel?.statistics?.subscriberCount ?? 0),
      total_views: Number(channel?.statistics?.viewCount ?? 0),
      video_count: Number(channel?.statistics?.videoCount ?? 0),
      source: 'YouTube (live, via Google OAuth)',
    },
    videos,
    playlists: (pl.items ?? []).map((p) => ({
      title: p.snippet.title,
      videos: Number(p.contentDetails?.itemCount ?? 0),
      status: p.status?.privacyStatus ? String(p.status.privacyStatus).replace(/^\w/, (s: string) => s.toUpperCase()) : 'Unknown',
      created: day(p.snippet.publishedAt),
    })),
    subscriptions: (subs.items ?? []).map((s) => ({
      channel: s.snippet.title,
      subscribed: day(s.snippet.publishedAt),
      description: String(s.snippet.description ?? '').split('\n')[0].slice(0, 160),
    })),
  }
}

async function revokeGoogleToken(token?: string) {
  if (!token) return
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined)
}

const youtubeRevoke = (c: Connection) => revokeGoogleToken(c.refreshToken || c.accessToken)

/* ---------------- routes ---------------- */

const SID = 'remix_sid'
const STATE = (p: Provider) => `remix_oauth_${p}`

export async function integrationsMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://x')
  const path = url.pathname
  if (!path.startsWith('/api/auth/') && !path.startsWith('/api/integrations')) return next()
  const jar = cookies(req)
  const sid = jar[SID]

  try {
    // GET /api/integrations — connection status (never includes tokens)
    if (path === '/api/integrations' && req.method === 'GET') {
      const out = (['github', 'youtube'] as Provider[]).map((p) => {
        const c = configured(p) ? getConnection(sid, p) : undefined
        return {
          provider: p,
          label: PROVIDERS[p].label,
          configured: configured(p),
          missing: configured(p) ? [] : [PROVIDERS[p].idVar, PROVIDERS[p].secretVar].filter((k) => !env(k)),
          redirectUri: redirectUri(p),
          connected: Boolean(c),
          account: c?.account ?? null,
          connectedAt: c?.connectedAt ?? null,
          scopes: c?.scope ?? null,
        }
      })
      return json(res, 200, { integrations: out, devSecret: usingGeneratedSecret() })
    }

    // GET /api/auth/:provider/start — begin OAuth
    let m = path.match(/^\/api\/auth\/(github|youtube)\/start$/)
    if (m && req.method === 'GET') {
      const p = m[1] as Provider
      if (!configured(p)) return redirect(res, backToApp({ integration_error: `${PROVIDERS[p].label} is not configured on the server`, provider: p }))
      const state = newState()
      const setCookies = [cookie(STATE(p), state, 600)]
      if (!sid) setCookies.push(cookie(SID, newSessionId(), 60 * 60 * 24 * 30))
      const auth =
        p === 'github'
          ? `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: PROVIDERS.github.clientId(), redirect_uri: redirectUri(p), scope: GITHUB_SCOPES(), state, allow_signup: 'false' })}`
          : `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
              client_id: PROVIDERS.youtube.clientId(),
              redirect_uri: redirectUri(p),
              response_type: 'code',
              scope: GOOGLE_SCOPES,
              access_type: 'offline',
              include_granted_scopes: 'true',
              prompt: 'consent',
              state,
            })}`
      return redirect(res, auth, setCookies)
    }

    // GET /api/auth/:provider/callback — finish OAuth
    m = path.match(/^\/api\/auth\/(github|youtube)\/callback$/)
    if (m && req.method === 'GET') {
      const p = m[1] as Provider
      const clearState = cookie(STATE(p), '', 0)
      const err = url.searchParams.get('error')
      if (err) return redirect(res, backToApp({ integration_error: err === 'access_denied' ? 'You cancelled the connection' : `${PROVIDERS[p].label}: ${url.searchParams.get('error_description') || err}`, provider: p }), [clearState])
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !sameState(state, jar[STATE(p)]) || !sid)
        return redirect(res, backToApp({ integration_error: 'Sign-in session expired or was tampered with. Please try again.', provider: p }), [clearState])
      try {
        const conn = p === 'github' ? await githubExchange(code) : await youtubeExchange(code)
        setConnection(sid, p, conn)
        return redirect(res, backToApp({ connected: p }), [clearState])
      } catch (e) {
        return redirect(res, backToApp({ integration_error: e instanceof Error ? e.message : 'Connection failed', provider: p }), [clearState])
      }
    }

    // GET /api/integrations/:provider/data — fetch fresh data with the stored token
    m = path.match(/^\/api\/integrations\/(github|youtube)\/data$/)
    if (m && req.method === 'GET') {
      const p = m[1] as Provider
      const c = getConnection(sid, p)
      if (!c) return json(res, 401, { error: `${PROVIDERS[p].label} is not connected` })
      try {
        const data = p === 'github' ? await githubData(c) : await youtubeData(sid!, c)
        const handle = (c.account.handle || c.account.name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || p
        return json(res, 200, { provider: p, account: c.account, fileName: `${p}-${handle}.json`, data, fetchedAt: Date.now() })
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) {
          // Token revoked or expired on the provider side: don't keep pretending it's connected.
          deleteConnection(sid!, p)
          return json(res, 401, { error: `${PROVIDERS[p].label} access was revoked or expired. Please reconnect.`, disconnected: true })
        }
        throw e
      }
    }

    // POST /api/integrations/:provider/disconnect — revoke + delete stored credentials
    m = path.match(/^\/api\/integrations\/(github|youtube)\/disconnect$/)
    if (m && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' })
      const p = m[1] as Provider
      const c = getConnection(sid, p)
      if (c) {
        if (p === 'github') await githubRevoke(c)
        else await youtubeRevoke(c)
        deleteConnection(sid!, p)
      }
      return json(res, 200, { ok: true })
    }

    if (path.startsWith('/api/integrations/') || path.startsWith('/api/auth/')) {
      const p = path.split('/')[3]
      return json(res, isProvider(p) ? 405 : 404, { error: 'Not found' })
    }
    return next()
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return json(res, status, { error: e instanceof Error ? e.message : 'Integration error' })
  }
}
