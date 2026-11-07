import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage } from 'node:http'
import { aiAvailable, generateWithClaude } from './server/ai.ts'
import { integrationsMiddleware } from './server/integrations.ts'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 2_000_000) reject(new Error('Payload too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// Server-side API. The Anthropic key only ever lives in this Node process.
function remixApi(): Plugin {
  const mount: Plugin['configureServer'] = (server) => {
    // Defense in depth: refuse any request that names server-only paths, however it is encoded.
    server.middlewares.use((req, res, next) => {
      let path = req.url ?? ''
      try {
        path = decodeURIComponent(path)
      } catch {
        /* keep raw */
      }
      if (/(^|\/)(\.data|\.env[^/]*)(\/|\?|$)|\/server\//.test(path.split('?')[0] + '/')) {
        res.statusCode = 404
        return res.end('Not found')
      }
      next()
    })
    // OAuth (GitHub, YouTube) + connected-account data. Tokens never leave this process.
    server.middlewares.use((req, res, next) => {
      integrationsMiddleware(req, res, next).catch(next)
    })
    server.middlewares.use('/api/status', (_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ai: aiAvailable(), model: aiAvailable() ? 'claude-opus-5-5' : null }))
    })
    server.middlewares.use('/api/generate', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end(JSON.stringify({ error: 'POST only' }))
      }
      if (!aiAvailable()) {
        res.statusCode = 503
        return res.end(JSON.stringify({ error: 'No ANTHROPIC_API_KEY configured' }))
      }
      try {
        const body = JSON.parse(await readBody(req))
        const spec = await generateWithClaude(body.prompt, body.tables)
        res.end(JSON.stringify({ spec }))
      } catch (e) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Generation failed' }))
      }
    })
  }
  return { name: 'remix-api', configureServer: mount, configurePreviewServer: mount as never }
}

// Server-only variables: loaded into process.env, never exposed to client code (no VITE_ prefix).
const SERVER_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_INCLUDE_PRIVATE',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'REMIX_SESSION_SECRET',
  'REMIX_BASE_URL',
]

export default defineConfig(({ mode }) => {
  // Vite restarts the server and re-runs this config whenever .env.local changes, so file values are
  // re-applied each time and edits take effect without restarting `npm run dev`. Variables exported in
  // the shell before the server first started always win.
  const g = globalThis as { __remixShellEnv?: Set<string> }
  g.__remixShellEnv ??= new Set(SERVER_VARS.filter((k) => process.env[k]))
  // loadEnv() merges process.env into its result, so drop values we set from the file last time first;
  // otherwise a value removed from .env.local would linger.
  for (const k of SERVER_VARS) if (!g.__remixShellEnv.has(k)) delete process.env[k]
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of SERVER_VARS) if (!g.__remixShellEnv.has(k) && env[k]) process.env[k] = env[k]
  return {
    plugins: [react(), tailwindcss(), remixApi()],
    server: {
      port: 5180,
      // Never serve server-side secrets: encrypted credentials + session secret live in .data/,
      // OAuth/API keys in .env*. (Vite's default deny list covers .env but not .data.)
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '.data', '.data/**', '**/.data/**', 'server/**'] },
    },
  }
})
