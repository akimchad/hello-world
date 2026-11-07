// Server-side only. Runs inside the Vite dev/preview server process; the key never reaches the browser.
import Anthropic from '@anthropic-ai/sdk'

export const aiAvailable = () =>
  !process.env.REMIX_DISABLE_AI && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

const SYSTEM = `You are REMIX, an engine that designs personalized dashboard applications from a user's own data.
You never write code. You return ONE JSON object (no prose, no markdown fences) describing an app built only from this catalog of widget types:

- "stat": a KPI. Keys: agg ("count" | "sum" | "avg" | "distinct" | "countWhere"), field (needed unless agg is "count"), equals (optional value for countWhere; omit to count truthy/done values).
- "bar": horizontal bars grouped by \`field\`. Optional valueField + agg ("count" | "sum" | "avg").
- "donut": share of rows grouped by \`field\`.
- "area": trend over time. dateField required, optional valueField to sum.
- "cards": one card per row. titleField required; optional subtitleField, badgeField, tagField, metricField, progressField.
- "table": rows as a table. columns: array of field names.
- "timeline": dated feed. dateField + titleField required; optional subtitleField, badgeField.
- "progress": progress bars (0-100). progressField + titleField required; optional subtitleField.
- "videos": media feed with thumbnails. titleField required; optional imageField (thumbnail URL), linkField (video URL), subtitleField (e.g. channel), dateField, metricField (e.g. views), variant ("grid" for a thumbnail feed, "list" for a compact latest-first list). Use it whenever rows have thumbnails.
- "checklist": interactive to-do list. doneField (boolean or status) + titleField required; optional subtitleField, badgeField, dateField.

Every widget needs: type, title (short, human), table (the table id exactly as given), size (1-4 columns of a 4-column grid; stats are 1, cards/table are 4).
Use ONLY field names that exist in the referenced table. Prefer 3-4 stats first, then charts, then lists. Use 6-10 widgets total, chosen to match what the user asked for.

Return exactly this shape:
{"title": string, "subtitle": string, "archetype": "developer"|"student"|"creator"|"generic", "primaryTable": table id for search/filter, "filterFields": [up to 2 categorical field names of primaryTable], "reasoning": [3-5 short sentences explaining how you mapped their data to the interface], "widgets": [ ... ]}`

export async function generateWithClaude(prompt: unknown, tables: unknown) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('Invalid prompt')
  if (!Array.isArray(tables) || !tables.length) throw new Error('No data provided')
  const client = new Anthropic()
  const request = {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `User request:\n${prompt}\n\nThe user's data (schema, inferred roles, sample rows):\n${JSON.stringify(tables).slice(0, 60000)}`,
      },
    ],
  }
  // Cast: `fallbacks: "default"` is newer than some SDK type definitions.
  const msg = (await client.beta.messages.create(request as never)) as Anthropic.Beta.BetaMessage
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this request')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON')
  return JSON.parse(text.slice(start, end + 1))
}
