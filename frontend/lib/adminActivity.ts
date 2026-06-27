export type AdminActivitySummary = {
  total_audit_rows: number
  created_24h: number
  created_7d: number
  actors_in_feed: number
  models_in_feed: number
}

export type AdminActivityEntry = {
  id: number
  action: string
  model_name: string
  object_pk: string
  object_repr: string
  summary: string
  actor_user_id: number | null
  request_path: string
  client_host: string
  changed_keys: string[]
  changed_data: Record<string, unknown>
  created_at: string | null
}

export type AdminActivity = {
  generated_at: string
  summary: AdminActivitySummary
  by_action: Record<string, number>
  by_model: Record<string, number>
  entries: AdminActivityEntry[]
}

export const EMPTY_ADMIN_ACTIVITY: AdminActivity = {
  generated_at: '',
  summary: {
    total_audit_rows: 0,
    created_24h: 0,
    created_7d: 0,
    actors_in_feed: 0,
    models_in_feed: 0,
  },
  by_action: {},
  by_model: {},
  entries: [],
}

export function formatActivityLabel(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replaceAll(':', ' / ')
}

export function activityMatches(entry: AdminActivityEntry, query: string) {
  if (!query) return true
  return [
    entry.action,
    entry.model_name,
    entry.object_pk,
    entry.object_repr,
    entry.summary,
    entry.request_path,
    entry.actor_user_id ? String(entry.actor_user_id) : '',
    ...entry.changed_keys,
  ].join(' ').toLowerCase().includes(query)
}
