import type { LiveSessionInteraction } from './professor'

export type LiveInteractionKind = 'message' | 'question'

const HIDDEN_STATUSES = new Set(['deleted', 'hidden'])

export function formatLiveDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function formatLiveShortTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function isLiveInteraction(value: unknown): value is LiveSessionInteraction {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'kind' in value && 'body' in value)
}

function timeValue(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function byOldestFirst(a: LiveSessionInteraction, b: LiveSessionInteraction) {
  const delta = timeValue(a.created_at) - timeValue(b.created_at)
  return delta || a.id - b.id
}

function byNewestFirst(a: LiveSessionInteraction, b: LiveSessionInteraction) {
  const delta = timeValue(b.created_at) - timeValue(a.created_at)
  return delta || b.id - a.id
}

export function mergeLiveInteraction(
  current: LiveSessionInteraction[],
  next: LiveSessionInteraction,
) {
  return mergeLiveInteractions(current, [next])
}

export function mergeLiveInteractions(
  current: LiveSessionInteraction[],
  next: LiveSessionInteraction[],
) {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const interaction of next) {
    const existing = byId.get(interaction.id)
    byId.set(interaction.id, existing ? { ...existing, ...interaction } : interaction)
  }
  return sortLiveInteractions(Array.from(byId.values()))
}

export function sortLiveInteractions(items: LiveSessionInteraction[]) {
  return [...items].sort(byNewestFirst)
}

export function visibleLiveInteractions(items: LiveSessionInteraction[]) {
  return items.filter((item) => !HIDDEN_STATUSES.has(item.status))
}

export function liveMessages(items: LiveSessionInteraction[]) {
  return visibleLiveInteractions(items)
    .filter((item) => item.kind === 'message')
    .sort(byOldestFirst)
}

export function liveQuestions(items: LiveSessionInteraction[]) {
  return visibleLiveInteractions(items)
    .filter((item) => item.kind === 'question')
    .sort((a, b) => {
      const aPending = a.status === 'pending' ? 0 : 1
      const bPending = b.status === 'pending' ? 0 : 1
      return aPending - bPending || byNewestFirst(a, b)
    })
}

export function liveInteractionInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}
