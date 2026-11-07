# REMIX — Your data. Your interface. Your rules.

Describe the software you want, bring your own data (JSON/CSV), and REMIX generates a working, personalized app around it.

**Describe → Generate → Customize → Use**

## Run

```bash
cd remix
npm install
npm run dev        # http://localhost:5180
```

Optional: put `ANTHROPIC_API_KEY=...` in `remix/.env.local` and restart. Generation then runs on Claude (`claude-opus-5-5`) through the server-side `/api/generate` endpoint. Without a key, REMIX uses its local rule-based engine, and the UI says so ("Local engine").

## Connected accounts (GitHub, YouTube)

On **Data Sources**, users can connect real accounts with OAuth. After a successful connection, REMIX syncs the data into a normal data source that is labeled "Live · github" or "Live · youtube", so the generator, Claude and every widget can use it.

| Provider | What REMIX reads | Scopes |
|---|---|---|
| GitHub | username, avatar, bio; repositories you own, collaborate on or can see through your orgs (name, description, primary language, top languages, stars, forks, issues, archived/fork status, visibility, topics); recent activity | `read:user` (public repos only). Set `GITHUB_INCLUDE_PRIVATE=true` to add `repo` for private repos. GitHub has no read-only private scope. |
| YouTube | channel name, picture, description, country, creation date and statistics; up to 50 latest uploads with stats; playlists; subscriptions | `youtube.readonly` only |

Security:
- OAuth tokens never reach the browser. The browser holds only an opaque `remix_sid` cookie (httpOnly, SameSite=Lax, and `Secure` on https).
- Tokens are encrypted with AES-256-GCM in `remix/.data/credentials.enc` (mode 600, git-ignored).
- The OAuth `state` parameter is checked on the callback, and cross-origin disconnects are rejected.
- **Disconnect** revokes the grant at the provider, deletes the stored token and removes the synced data.
- If a token is revoked or a Google refresh token expires, the next sync detects it and marks the account as disconnected.
- If the user signs in but denies the YouTube permission, the token is revoked straight away and the account is not connected.

### Using connected data in the Workspace
1. Connect GitHub or YouTube on **Data Sources**. After the data syncs, click **Build an app**, or use the **Build from your accounts** cards in the Workspace.
2. Use **Choose data** in the prompt box to pick which sources (uploads, demo files, connected accounts) and which datasets inside them, such as repositories or activity, the app should use.
3. Describe the app and click **Generate**. Only the datasets you left switched on reach the generator.

### Setup

Copy `.env.example` to `.env.local` and fill it in, then restart `npm run dev`.

**GitHub OAuth App:** go to https://github.com/settings/developers → *OAuth Apps* → *New OAuth App*.
- Homepage URL: `http://localhost:5180`
- Authorization callback URL: `http://localhost:5180/api/auth/github/callback`
- Copy the Client ID into `GITHUB_CLIENT_ID`. Generate a client secret and copy it into `GITHUB_CLIENT_SECRET`.

**Google / YouTube:** go to https://console.cloud.google.com.
1. Create or select a project, then enable **YouTube Data API v3** (*APIs & Services → Library*).
2. Configure the *OAuth consent screen* (or *Google Auth Platform*): user type External, add the scope `https://www.googleapis.com/auth/youtube.readonly`, and add your Google account under **Test users**. While the app is in Testing mode, only test users can connect.
3. Go to *Credentials → Create credentials → OAuth client ID → Web application*.
   - Authorized redirect URI: `http://localhost:5180/api/auth/youtube/callback`
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Other variables**
- `REMIX_SESSION_SECRET`: 32+ random characters used to encrypt stored tokens. In local development, a secret is generated automatically into `.data/session-secret` if this is unset. Set it explicitly anywhere else.
- `REMIX_BASE_URL`: the public URL of the app (default `http://localhost:5180`). It must match the redirect URIs registered above. If you deploy, register the new callback URLs with both providers.

## 30-second demo

1. Click **Developer Command Center** under "Start from an example" (loads the clearly-labeled demo `github-profile.json` and a prompt).
2. Hit **Generate**.
3. Search, filter by status/language, tick tasks off (the KPIs update), then open **Customize** to rename the app, switch layout/theme/accent, and add or remove widgets.

## How it works

- `src/lib/parse.ts`: parses CSV/JSON in the browser, splits JSON objects into tables, and profiles every field (type plus a role such as name, status, language, date, metric, progress or done).
- `src/lib/engine.ts`: `generateLocal()` maps prompt intent and the field profile to a spec of supported widgets. `sanitizeSpec()` checks any model output against the widget catalog and the real field names.
- `server/ai.ts`: the Claude call. The key stays in the Node process. The model only returns JSON, and **no AI-generated code or HTML is ever executed**; specs are rendered by fixed React components.
- The workspace (data sources, apps and customizations) persists in `localStorage`.
