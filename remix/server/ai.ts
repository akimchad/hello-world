// Server-side only. Runs inside the Vite dev/preview server process; the key never reaches the browser.
import Anthropic from '@anthropic-ai/sdk'

export const aiAvailable = () =>
  !process.env.REMIX_DISABLE_AI && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

const SYSTEM = `You are REMIX, an engine that designs personalized dashboard applications from a user's own data.
You never write code. You return ONE JSON object (no prose, no markdown fences) describing an app built only from this catalog of widget types.

Data widgets (every one needs "table": a table id exactly as given, and only field names that exist in that table):
- "stat": a KPI. agg ("count" | "sum" | "avg" | "distinct" | "countWhere"), field (needed unless agg is "count"), equals (optional value for countWhere; omit to count truthy/done values).
- "bar": horizontal bars grouped by \`field\`. Optional valueField + agg ("count" | "sum" | "avg"). Good for languages, channels, top items by a metric.
- "donut": share of rows grouped by \`field\`. Only when the field has 2+ distinct values.
- "area": trend over time. dateField required, optional valueField to sum.
- "cards": one card per row, ranked by metricField when given (e.g. repositories by stars). titleField required; optional subtitleField, badgeField, tagField, metricField, progressField.
- "table": rows as a table. columns: array of field names.
- "timeline": dated feed. dateField + titleField required; optional subtitleField, badgeField.
- "progress": progress bars (0-100). progressField + titleField required; optional subtitleField.
- "videos": thumbnail feed for rows with thumbnails (e.g. YouTube videos). titleField required; optional subtitleField (channel), dateField, metricField (views), variant ("grid" feed or "list" latest-first). REMIX fills in thumbnails and links itself.
- "checklist": interactive to-do list over rows. doneField (boolean or status) + titleField required.

Cross-platform widgets (no fields needed; REMIX wires them to all chosen tables). Use them when they fit the request:
- "summary": a short auto-summary of the newest videos and code activity. Put it first when the user wants a feed or "what's new".
- "unified": one timeline mixing videos and code activity with All / Code only / Video only filters. Only useful when both video and code data are present.

Widgets YOU write from the rows you are given (plain text, no markdown, no HTML):
- "insight": {"title", "text": 2-4 sentences of genuine analysis of THIS user's data, "bullets": up to 5 specific observations}. Cite real names, counts and dates from the rows. Never invent facts; if data is thin, say what is and isn't there.
- "actions": {"title", "items": [{"text": a concrete next step, "detail": optional one-line reason grounded in the data}]} — 3-6 action items the user can tick off (e.g. "Watch the new upload from <channel>", "Review open PR #1 in <repo>"). Every item must follow from the data.

Every widget also needs: "type", "title" (short, human) and "size" (1-4 columns of a 4-column grid; stats 1, feeds/cards/tables 4, charts 2).
Design for what the user asked. Prefer: 2-4 stats, then the feed or main list, then 2-4 charts, plus one insight and one actions widget. 7-12 widgets total.
Rows marked as coming from a live connected account are the user's real data; build around them rather than demo data.

Return exactly this shape:
{"title": string, "subtitle": string, "archetype": "developer"|"student"|"creator"|"generic", "primaryTable": table id for search/filter, "filterFields": [up to 2 categorical field names of primaryTable], "reasoning": [3-5 short sentences explaining how you mapped their data to the interface], "widgets": [ ... ]}`

/** Serialize the data context, dropping rows (never cutting JSON mid-way) until it fits the budget. */
function compact(tables: unknown[], budget = 120_000): string {
  let t = tables as { rows?: unknown[] }[]
  let out = JSON.stringify(t)
  for (let keep = 30; out.length > budget && keep >= 3; keep -= 9) {
    t = t.map((x) => ({ ...x, rows: Array.isArray(x.rows) ? x.rows.slice(0, keep) : x.rows }))
    out = JSON.stringify(t)
  }
  return out
}

export async function generateWithClaude(prompt: unknown, tables: unknown) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('Invalid prompt')
  if (!Array.isArray(tables) || !tables.length) throw new Error('No data provided')
  // Key comes from process.env (loaded from remix/.env.local by vite.config.ts); it is never logged or returned.
  const client = new Anthropic({ timeout: 110_000, maxRetries: 1 })
  const request = {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `User request:\n${prompt}\n\nThe user's data (schema, inferred roles and real rows, newest first):\n${compact(tables)}`,
      },
    ],
  }
  // Cast: `fallbacks: "default"` is newer than some SDK type definitions.
  const msg = (await client.beta.messages.create(request as never)) as Anthropic.Beta.BetaMessage
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this request')
  if (msg.stop_reason === 'max_tokens') throw new Error('The model response was cut off')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON')
  return JSON.parse(text.slice(start, end + 1))
}
