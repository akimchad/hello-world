// Cross-platform feed: normalizes rows from different tables (YouTube videos, GitHub activity, ...)
// into one timeline, and writes a plain-language summary of it. Everything is computed from the
// user's real rows at render time, so it follows search, filters and re-syncs.
import type { FeedSource } from '../types'
import { formatNumber, parseDate, relativeDate, str, type IRow } from './data'

export interface FeedItem {
  key: string
  kind: FeedSource['kind']
  title: string
  subtitle: string
  date: string // YYYY-MM-DD or ISO
  time: number
  image?: string
  link?: string
  metric?: number
  badge?: string
  row: IRow
  table: string
}

const safeHttp = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

export function buildFeed(feeds: FeedSource[], rowsOf: (table: string) => IRow[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const f of feeds) {
    for (const r of rowsOf(f.table)) {
      const date = str(r[f.dateField])
      const time = parseDate(date)
      if (isNaN(time)) continue
      const m = f.metricField ? Number(r[f.metricField]) : NaN
      items.push({
        key: `${f.table}#${r.__i}`,
        kind: f.kind,
        title: str(r[f.titleField]) || '(untitled)',
        subtitle: f.subtitleField ? str(r[f.subtitleField]) : '',
        date,
        time,
        image: f.imageField ? safeHttp(str(r[f.imageField])) : undefined,
        link: f.linkField ? safeHttp(str(r[f.linkField])) : undefined,
        metric: isNaN(m) ? undefined : m,
        badge: f.badgeField ? str(r[f.badgeField]) || undefined : undefined,
        row: r,
        table: f.table,
      })
    }
  }
  return items.sort((a, b) => b.time - a.time)
}

export function dayLabel(t: number) {
  const d = new Date(t)
  const r = relativeDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  return /ago|in \d/.test(r) ? new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : r
}

export interface Summary {
  headline: string
  lines: { text: string; item?: FeedItem }[]
  window: string
}

function topBy<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, number>()
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/** Plain-language summary of the latest releases/activity. Deterministic and based only on the rows given. */
export function summarize(items: FeedItem[]): Summary | null {
  if (!items.length) return null
  const newest = items[0].time
  // Look at the last 7 days of activity relative to now; fall back to 30 days, then to everything.
  const now = Date.now()
  let windowDays = 7
  let recent = items.filter((x) => now - x.time <= 7 * 864e5)
  if (!recent.length) {
    windowDays = 30
    recent = items.filter((x) => now - x.time <= 30 * 864e5)
  }
  const hasRecent = recent.length > 0
  const window = hasRecent ? `last ${windowDays} days` : 'all synced items'
  if (!hasRecent) recent = items

  const videos = recent.filter((x) => x.kind === 'video')
  const code = recent.filter((x) => x.kind === 'code')
  const parts: string[] = []
  const lines: Summary['lines'] = []

  if (videos.length) {
    const channels = topBy(videos, (v) => v.subtitle || 'Unknown channel')
    parts.push(`${videos.length} new video${videos.length === 1 ? '' : 's'} from ${channels.length} channel${channels.length === 1 ? '' : 's'}`)
    if (channels.length > 1) lines.push({ text: `Most active channel: ${channels[0][0]} (${channels[0][1]} video${channels[0][1] === 1 ? '' : 's'})` })
    const latest = videos[0]
    lines.push({ text: `Newest: “${latest.title}”${latest.subtitle ? ` by ${latest.subtitle}` : ''}, ${dayLabel(latest.time).toLowerCase()}`, item: latest })
    const viewed = videos.filter((v) => v.metric !== undefined).sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0))[0]
    if (viewed && viewed !== latest) lines.push({ text: `Most watched: “${viewed.title}” with ${formatNumber(viewed.metric ?? 0)} views`, item: viewed })
  }
  if (code.length) {
    const repos = topBy(code, (c) => c.subtitle || 'a repository')
    parts.push(`${code.length} code event${code.length === 1 ? '' : 's'} across ${repos.length} repo${repos.length === 1 ? '' : 's'}`)
    lines.push({ text: `Most active repo: ${repos[0][0]} (${repos[0][1]} event${repos[0][1] === 1 ? '' : 's'})` })
    const last = code[0]
    lines.push({ text: `Latest code activity: ${last.title}${last.subtitle ? ` in ${last.subtitle}` : ''}, ${dayLabel(last.time).toLowerCase()}`, item: last })
  }
  const headline = parts.length
    ? `${parts.join(' and ')} ${hasRecent ? `in the ${window}` : 'synced (nothing new in the last 30 days)'}.`
    : `Latest update ${dayLabel(newest).toLowerCase()}.`
  return { headline: headline.charAt(0).toUpperCase() + headline.slice(1), lines, window }
}
