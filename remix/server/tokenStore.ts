// Server-side credential store.
// OAuth tokens are kept per browser session, encrypted at rest with AES-256-GCM, and never sent to the browser.
// The browser only holds an opaque, httpOnly session-id cookie.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Provider = 'github' | 'youtube'

export interface Account {
  id: string
  name: string
  handle?: string
  avatar?: string
  url?: string
}

export interface Connection {
  accessToken: string
  refreshToken?: string
  expiresAt?: number // ms epoch, when the access token expires (Google)
  scope: string
  account: Account
  connectedAt: number
}

type SessionRecord = Partial<Record<Provider, Connection>>

const DATA_DIR = join(process.cwd(), '.data')
const FILE = join(DATA_DIR, 'credentials.enc')
const SECRET_FILE = join(DATA_DIR, 'session-secret')

let key: Buffer | null = null
let generatedSecret = false

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
}

/** Encryption key from REMIX_SESSION_SECRET; for local dev, a random secret is generated once and kept in .data/. */
function getKey(): Buffer {
  if (key) return key
  let secret = process.env.REMIX_SESSION_SECRET
  if (!secret || secret.length < 32) {
    ensureDir()
    if (existsSync(SECRET_FILE)) secret = readFileSync(SECRET_FILE, 'utf8').trim()
    else {
      secret = randomBytes(48).toString('base64url')
      writeFileSync(SECRET_FILE, secret, { mode: 0o600 })
    }
    generatedSecret = true
  }
  key = createHash('sha256').update(secret).digest()
  return key
}

export const usingGeneratedSecret = () => (getKey(), generatedSecret)

let sessions: Record<string, SessionRecord> | null = null

function load(): Record<string, SessionRecord> {
  if (sessions) return sessions
  sessions = {}
  try {
    if (existsSync(FILE)) {
      const { iv, tag, data } = JSON.parse(readFileSync(FILE, 'utf8'))
      const d = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'))
      d.setAuthTag(Buffer.from(tag, 'base64'))
      sessions = JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'))
    }
  } catch {
    // Wrong secret or corrupted file: start clean rather than expose anything.
    sessions = {}
  }
  return sessions!
}

function persist() {
  ensureDir()
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', getKey(), iv)
  const data = Buffer.concat([c.update(JSON.stringify(sessions ?? {}), 'utf8'), c.final()])
  writeFileSync(FILE, JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 })
  try {
    chmodSync(FILE, 0o600)
  } catch {
    /* best effort on non-POSIX filesystems */
  }
}

export function getConnection(sid: string | undefined, p: Provider): Connection | undefined {
  if (!sid) return undefined
  return load()[sid]?.[p]
}

export function setConnection(sid: string, p: Provider, c: Connection) {
  const s = load()
  s[sid] = { ...s[sid], [p]: c }
  persist()
}

export function deleteConnection(sid: string, p: Provider) {
  const s = load()
  if (!s[sid]) return
  delete s[sid][p]
  if (!Object.keys(s[sid]).length) delete s[sid]
  persist()
}

export const newSessionId = () => randomBytes(32).toString('base64url')
export const newState = () => randomBytes(24).toString('base64url')
