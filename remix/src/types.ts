export type Row = Record<string, unknown>

export type FieldType = 'number' | 'date' | 'category' | 'text' | 'boolean' | 'list'

export type Role =
  | 'name'
  | 'status'
  | 'language'
  | 'category'
  | 'date'
  | 'progress'
  | 'metric'
  | 'done'
  | 'description'
  | 'tags'
  | 'url'
  | 'priority'
  | 'image'

export interface Field {
  name: string
  type: FieldType
  distinct: number
  samples: string[]
  roles: Role[]
}

export interface Table {
  id: string // `${sourceId}:${name}`
  name: string
  rows: Row[]
  fields: Field[]
}

export interface DataSource {
  id: string
  fileName: string
  size: number
  format: 'json' | 'csv'
  uploadedAt: number
  sample: boolean
  /** Set when this source was synced live from a connected account (not an upload). */
  connector?: 'github' | 'youtube'
  account?: { name: string; handle?: string; avatar?: string }
  /** Datasets (table names) the user chose NOT to use when generating apps. */
  excludedTables?: string[]
  tables: Table[]
  profile?: Record<string, unknown>
}

export type WidgetType =
  | 'stat'
  | 'bar'
  | 'donut'
  | 'area'
  | 'cards'
  | 'table'
  | 'timeline'
  | 'progress'
  | 'checklist'
  | 'videos'
  | 'unified'
  | 'summary'
  | 'insight'
  | 'actions'

export const WIDGET_TYPES: WidgetType[] = ['stat', 'bar', 'donut', 'area', 'cards', 'table', 'timeline', 'progress', 'checklist', 'videos', 'unified', 'summary', 'insight', 'actions']

/** One table mapped into a cross-platform feed (used by the unified feed and the summary widget). */
export interface FeedSource {
  table: string
  kind: 'video' | 'code'
  titleField: string
  dateField: string
  subtitleField?: string
  imageField?: string
  linkField?: string
  metricField?: string
  badgeField?: string
}

export interface Widget {
  id: string
  type: WidgetType
  title: string
  table: string
  size: 1 | 2 | 3 | 4
  visible: boolean
  // bindings (all optional, interpretation depends on type)
  field?: string
  valueField?: string
  agg?: 'count' | 'sum' | 'avg' | 'distinct' | 'countWhere'
  equals?: string
  dateField?: string
  titleField?: string
  subtitleField?: string
  badgeField?: string
  tagField?: string
  metricField?: string
  progressField?: string
  doneField?: string
  columns?: string[]
  hint?: string
  /** media widgets: thumbnail + link fields, and grid (feed) or list layout */
  imageField?: string
  linkField?: string
  variant?: 'grid' | 'list'
  /** unified feed / summary: the tables they combine */
  feeds?: FeedSource[]
  /** insight: analysis text written by Claude at generation time (rendered as plain text, never HTML) */
  text?: string
  bullets?: string[]
  /** actions: suggested next steps written by Claude; ticks are stored in AppSpec.overrides */
  items?: { text: string; detail?: string }[]
}

export type Archetype = 'developer' | 'student' | 'creator' | 'generic'
export type Layout = 'grid' | 'compact' | 'focus'

export interface AppSpec {
  id: string
  title: string
  subtitle: string
  archetype: Archetype
  prompt: string
  sourceIds: string[]
  widgets: Widget[]
  layout: Layout
  accent: string
  engine: 'claude' | 'local'
  reasoning: string[]
  primaryTable?: string
  filterFields: string[]
  /** Focus Mode: only active tasks and video feeds/playlists are shown */
  focusMode?: boolean
  overrides: Record<string, boolean> // checklist toggles: `${tableId}#${rowIndex}#${field}`
  createdAt: number
}

export type View = 'workspace' | 'apps' | 'data' | 'settings' | 'app'
