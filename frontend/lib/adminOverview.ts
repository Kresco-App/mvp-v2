export type CrudActions = {
  create: boolean
  read: boolean
  update: boolean
  delete: boolean
}

export type CrudCatalogItem = {
  domain: string
  slug: string
  name: string
  name_plural: string
  model: string
  admin_url: string
  actions: CrudActions
}

type OverviewSection = Record<string, any>

export type AdminOverview = {
  generated_at: string
  totals: Record<string, number>
  content_status: Record<string, Record<string, number>>
  access_billing: OverviewSection
  ops_readiness: OverviewSection
  progress_xp: OverviewSection
  exam_bank: OverviewSection
  calendar: OverviewSection
  engagement: OverviewSection
  interactions: OverviewSection
  notifications: OverviewSection
  finance: OverviewSection
  communications: OverviewSection
  admin_audit?: OverviewSection
  crud_catalog: CrudCatalogItem[]
}

export type LoadState = 'loading' | 'ready' | 'fallback' | 'forbidden' | 'error'

export const DOMAIN_LABELS: Record<string, string> = {
  'knowledge-base': 'Knowledge base',
  resources: 'Resources',
  quiz: 'Quizzes',
  'exam-bank': 'Exam bank',
  'users-access': 'Users',
  'access-billing': 'Access',
  'progress-xp': 'Progress and XP',
  engagement: 'Engagement',
  'notes-saves-comments': 'Community data',
  finance: 'Finance',
  messages: 'Messages',
  support: 'Support',
  calendar: 'Calendar',
  notifications: 'Notifications',
  'admin-audit': 'Admin audit',
}

export const FALLBACK_CRUD: CrudCatalogItem[] = [
  crud('knowledge-base', 'subject', 'Subject', 'Subjects', 'Subject'),
  crud('knowledge-base', 'topic', 'Topic', 'Topics', 'Topic'),
  crud('knowledge-base', 'topic-section', 'Topic Section', 'Topic Sections', 'TopicSection'),
  crud('knowledge-base', 'topic-item', 'Topic Item', 'Topic Items', 'TopicItem'),
  crud('resources', 'resource', 'Resource', 'Resources', 'Resource'),
  crud('knowledge-base', 'tab-content', 'Tab Content', 'Tab Contents', 'TabContent'),
  crud('knowledge-base', 'concept-tag', 'Concept Tag', 'Concept Tags', 'ConceptTag'),
  crud('quiz', 'question-set', 'Question Set', 'Question Sets', 'QuestionSet'),
  crud('quiz', 'question', 'Question', 'Questions', 'Question'),
  crud('exam-bank', 'exam', 'Exam', 'Exams', 'Exam'),
  crud('exam-bank', 'exam-problem', 'Exam Problem', 'Exam Problems', 'ExamProblem'),
  crud('users-access', 'user', 'User', 'Users', 'User'),
  crud('access-billing', 'user-subject-entitlement', 'Subject Entitlement', 'Subject Entitlements', 'UserSubjectEntitlement'),
  crud('progress-xp', 'topic-item-progress', 'Topic Item Progress', 'Topic Item Progress', 'TopicItemProgress', false),
  crud('progress-xp', 'quiz-attempt', 'Quiz Attempt', 'Quiz Attempts', 'QuizAttempt', false),
  crud('progress-xp', 'question-attempt', 'Question Attempt', 'Question Attempts', 'QuestionAttempt', false),
  crud('progress-xp', 'user-xp', 'User XP', 'User XP Records', 'UserXP', false),
  crud('progress-xp', 'xp-transaction', 'XP Transaction', 'XP Transactions', 'XPTransaction', false),
  crud('progress-xp', 'daily-quest', 'Daily Quest', 'Daily Quests', 'DailyQuest', false),
  crud('notes-saves-comments', 'user-note', 'User Note', 'User Notes', 'UserNote', false),
  crud('notes-saves-comments', 'saved-item', 'Saved Item', 'Saved Items', 'SavedItem', false),
  crud('notes-saves-comments', 'comment', 'Comment', 'Comments', 'Comment', false),
  crud('calendar', 'calendar-event', 'Calendar Event', 'Calendar Events', 'CalendarEvent'),
  crud('notifications', 'notification', 'Notification', 'Notifications', 'Notification'),
  crud('admin-audit', 'admin-audit-log', 'Admin Audit Log', 'Admin Audit Logs', 'AdminAuditLog', false),
]

export const EMPTY_OVERVIEW: AdminOverview = {
  generated_at: '',
  totals: {},
  content_status: {},
  access_billing: {},
  ops_readiness: {},
  progress_xp: {},
  exam_bank: {},
  calendar: {},
  engagement: {},
  interactions: {},
  notifications: {},
  finance: {},
  communications: {},
  admin_audit: {},
  crud_catalog: FALLBACK_CRUD,
}

function crud(
  domain: string,
  slug: string,
  name: string,
  namePlural: string,
  model: string,
  canCreate = true,
): CrudCatalogItem {
  return {
    domain,
    slug,
    name,
    name_plural: namePlural,
    model,
    admin_url: `/admin/${slug}/list`,
    actions: { create: canCreate, read: true, update: true, delete: true },
  }
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function formatNumber(value: unknown): string {
  return numberValue(value).toLocaleString('en-US')
}

export function percent(value: unknown): string {
  return `${numberValue(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

export function sumValues(values?: Record<string, unknown>): number {
  return Object.values(values ?? {}).reduce<number>((sum, value) => sum + numberValue(value), 0)
}

export function statusTotal(statuses?: Record<string, number>): number {
  return Object.values(statuses ?? {}).reduce((sum, value) => sum + numberValue(value), 0)
}

export function publishedRatio(statuses?: Record<string, number>): number {
  const total = statusTotal(statuses)
  if (!total) return 0
  const ready = numberValue(statuses?.published) + numberValue(statuses?.active) + numberValue(statuses?.scheduled)
  return Math.round((ready / total) * 100)
}

export function formatMoneyCentimes(value: unknown): string {
  return `${(numberValue(value) / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })} MAD`
}

export function recordEntries(record?: Record<string, unknown>, limit = 6) {
  return Object.entries(record ?? {})
    .map(([key, value]) => ({ key, value: numberValue(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export function groupByDomain(items: CrudCatalogItem[]) {
  return items.reduce<Record<string, CrudCatalogItem[]>>((acc, item) => {
    acc[item.domain] = acc[item.domain] ?? []
    acc[item.domain].push(item)
    return acc
  }, {})
}

export function filterCrudCatalog(items: CrudCatalogItem[] | undefined, query: string) {
  const source = items?.length ? items : FALLBACK_CRUD
  const text = query.trim().toLowerCase()
  if (!text) return source

  return source.filter((item) => {
    return [
      item.name,
      item.name_plural,
      item.model,
      DOMAIN_LABELS[item.domain] ?? item.domain,
    ].join(' ').toLowerCase().includes(text)
  })
}
