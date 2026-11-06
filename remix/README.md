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

## 30-second demo

1. Click **Developer Command Center** under "Start from an example" (loads the clearly-labeled demo `github-profile.json` and a prompt).
2. Hit **Generate**.
3. Search, filter by status/language, tick tasks off (the KPIs update), then open **Customize** to rename the app, switch layout/theme/accent, and add or remove widgets.

## How it works

- `src/lib/parse.ts`: parses CSV/JSON in the browser, splits JSON objects into tables, and profiles every field (type plus a role such as name, status, language, date, metric, progress or done).
- `src/lib/engine.ts`: `generateLocal()` maps prompt intent and the field profile to a spec of supported widgets. `sanitizeSpec()` checks any model output against the widget catalog and the real field names.
- `server/ai.ts`: the Claude call. The key stays in the Node process. The model only returns JSON, and **no AI-generated code or HTML is ever executed**; specs are rendered by fixed React components.
- The workspace (data sources, apps and customizations) persists in `localStorage`.
