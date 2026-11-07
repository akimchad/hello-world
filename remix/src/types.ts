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

export const WIDGET_TYPES: WidgetType[] = ['stat', 'bar', 'donut', 'area', 'cards', 'table', 'timeline', 'progress', 'checklist']

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
  overrides: Record<string, boolean> // checklist toggles: `${tableId}#${rowIndex}#${field}`
  createdAt: number
}

export type View = 'workspace' | 'apps' | 'data' | 'settings' | 'app'
