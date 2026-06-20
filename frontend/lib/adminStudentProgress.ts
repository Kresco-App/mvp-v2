export type AdminStudentProgressSummary = {
  total_students: number
  active_students_7d: number
  students_with_progress: number
  completed_topic_items: number
  total_watch_minutes: number
  quiz_attempts: number
  quiz_passed: number
  total_xp: number
}

export type AdminStudentProgressRow = {
  user_id: number
  full_name: string
  email: string
  tier: string
  niveau: string
  filiere: string
  is_pro: boolean
  total_xp: number
  streak_days: number
  progress_records: number
  completed_items: number
  in_progress_items: number
  watched_minutes: number
  quiz_attempts: number
  quiz_passed: number
  average_quiz_score: number
  last_activity_at: string | null
}

export type AdminStudentProgress = {
  generated_at: string
  summary: AdminStudentProgressSummary
  progress_by_status: Record<string, number>
  students: AdminStudentProgressRow[]
}

export type AdminXpReasonBreakdown = {
  reason: string
  count: number
  amount: number
  requested_amount: number
}

export type AdminXpTransaction = {
  transaction_id: number
  user_id: number
  amount: number
  requested_amount: number
  reason: string
  description: string
  subject_id: number | null
  topic_id: number | null
  topic_section_id: number | null
  topic_item_id: number | null
  question_set_id: number | null
  question_id: number | null
  quiz_attempt_id: number | null
  question_attempt_id: number | null
  idempotency_key: string | null
  daily_cap_category: string | null
  daily_cap_date: string | null
  cap_applied: boolean
  created_at: string
}

export type AdminXpAudit = {
  user_id: number
  stored_total_xp: number
  transaction_sum_xp: number
  delta_xp: number
  transaction_count: number
  adjustment_count: number
  adjustment_sum_xp: number
  capped_amount_xp: number
  has_total_mismatch: boolean
  reason_breakdown: AdminXpReasonBreakdown[]
  transactions: AdminXpTransaction[]
}

export type AdminXpAdjustment = {
  transaction_id: number
  user_id: number
  amount: number
  requested_amount: number
  reason: string
  description: string
  idempotency_key: string
  actor_user_id: number
  total_xp: number
  created_at: string
}

export const EMPTY_STUDENT_PROGRESS: AdminStudentProgress = {
  generated_at: '',
  summary: {
    total_students: 0,
    active_students_7d: 0,
    students_with_progress: 0,
    completed_topic_items: 0,
    total_watch_minutes: 0,
    quiz_attempts: 0,
    quiz_passed: 0,
    total_xp: 0,
  },
  progress_by_status: {},
  students: [],
}

export const EMPTY_XP_AUDIT: AdminXpAudit = {
  user_id: 0,
  stored_total_xp: 0,
  transaction_sum_xp: 0,
  delta_xp: 0,
  transaction_count: 0,
  adjustment_count: 0,
  adjustment_sum_xp: 0,
  capped_amount_xp: 0,
  has_total_mismatch: false,
  reason_breakdown: [],
  transactions: [],
}

export function quizPassRate(summary: AdminStudentProgressSummary) {
  if (!summary.quiz_attempts) return 0
  return Math.round((summary.quiz_passed / summary.quiz_attempts) * 100)
}

export function studentProgressCoverage(summary: AdminStudentProgressSummary) {
  if (!summary.total_students) return 0
  return Math.round((summary.students_with_progress / summary.total_students) * 100)
}

export function buildXpAdjustmentIdempotencyKey(userId: number) {
  return `admin-xp:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
}
