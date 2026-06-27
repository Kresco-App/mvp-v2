import useSWR, { mutate } from 'swr'
import { apiSWRFetcher } from '@/lib/apiData'
import { patchJson, postJson } from '@/lib/apiClient'
import type { AccessGuarded } from '@/lib/topicWorkspaceTypes'

export type ExerciseSelfGrade = 'not_started' | 'again' | 'partial' | 'mastered'

export type ExerciseListItem = AccessGuarded & {
  id: number
  subject_id: number
  topic_id: number | null
  title: string
  slug: string
  summary: string
  difficulty: string
  estimated_minutes: number
  order: number
  concept_slugs: string[]
  is_free_preview: boolean
  self_grade: ExerciseSelfGrade
  saved: boolean
  has_solution_body: boolean
  has_solution_video: boolean
  asset_count: number
  created_at: string
  updated_at: string
}

export type ExerciseAsset = {
  id: number
  asset_type: string
  url: string
  alt_text: string
  caption: string
  metadata_json: Record<string, unknown>
  order: number
}

export type ExerciseDetail = ExerciseListItem & {
  statement_body: string
  solution_body: string
  solution_video_url: string
  assets: ExerciseAsset[]
  reveal_count: number
  first_revealed_at: string | null
  last_revealed_at: string | null
  self_grade_history: Array<Record<string, unknown>>
  notes: string
  can_save_notes: boolean
  metadata_json: Record<string, unknown>
}

export type ExerciseBankList = {
  subject_id: number
  topic_id: number | null
  items: ExerciseListItem[]
  total: number
}

export type ExerciseFilters = {
  difficulty?: string
  selfGrade?: string
  saved?: boolean | null
}

export type ExerciseProgressMutation = {
  exercise: ExerciseDetail
  xp_awarded: number
}

export function exerciseBankSWRKey(subjectId: number | null, filters: ExerciseFilters = {}) {
  if (!subjectId) return null
  const params = new URLSearchParams()
  params.set('limit', '50')
  if (filters.difficulty) params.set('difficulty', filters.difficulty)
  if (filters.selfGrade) params.set('self_grade', filters.selfGrade)
  if (typeof filters.saved === 'boolean') params.set('saved', String(filters.saved))
  const query = params.toString()
  return `/exercises/subjects/${subjectId}${query ? `?${query}` : ''}`
}

export function useExerciseBankData(subjectId: number | null, filters: ExerciseFilters = {}) {
  const key = exerciseBankSWRKey(subjectId, filters)
  const query = useSWR<ExerciseBankList>(key, apiSWRFetcher, { keepPreviousData: false })
  const data = query.data?.subject_id === subjectId ? query.data : null

  return {
    key,
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total ?? 0),
    loading: query.isLoading && !data,
    error: query.error ?? null,
    retry: query.mutate,
  }
}

export function exerciseDetailSWRKey(exerciseId: number | null) {
  return exerciseId ? `/exercises/${exerciseId}` : null
}

export function useExerciseDetail(exerciseId: number | null) {
  const key = exerciseDetailSWRKey(exerciseId)
  const query = useSWR<ExerciseDetail>(key, apiSWRFetcher)
  const data = query.data?.id === exerciseId ? query.data : null

  return {
    key,
    exercise: data,
    loading: query.isLoading && !data,
    error: query.error ?? null,
    retry: query.mutate,
  }
}

export async function revealExercise(exerciseId: number) {
  const result = await postJson<ExerciseProgressMutation>(`/exercises/${exerciseId}/reveal`)
  await refreshExerciseCaches(result.exercise)
  return result
}

export async function selfGradeExercise(exerciseId: number, selfGrade: Exclude<ExerciseSelfGrade, 'not_started'>) {
  const result = await postJson<ExerciseProgressMutation, { self_grade: string }>(
    `/exercises/${exerciseId}/self-grade`,
    { self_grade: selfGrade },
  )
  await refreshExerciseCaches(result.exercise)
  return result
}

export async function saveExercise(exerciseId: number, saved: boolean) {
  const result = await postJson<ExerciseProgressMutation, { saved: boolean }>(
    `/exercises/${exerciseId}/saved`,
    { saved },
  )
  await refreshExerciseCaches(result.exercise)
  return result
}

export async function updateExerciseNotes(exerciseId: number, notes: string) {
  const result = await patchJson<ExerciseProgressMutation, { notes: string }>(
    `/exercises/${exerciseId}/notes`,
    { notes },
  )
  await mutate(`/exercises/${result.exercise.id}`, result.exercise, false)
  return result
}

async function refreshExerciseCaches(exercise: ExerciseDetail) {
  await Promise.all([
    mutate(`/exercises/${exercise.id}`, exercise, false),
    mutate(
      (key) => typeof key === 'string' && key.startsWith(`/exercises/subjects/${exercise.subject_id}`),
      (current: ExerciseBankList | undefined) => mergeExerciseIntoList(current, exercise),
      { revalidate: false },
    ),
  ])
}

function mergeExerciseIntoList(current: ExerciseBankList | undefined, exercise: ExerciseDetail) {
  if (!current || !Array.isArray(current.items)) return current

  let changed = false
  const items = current.items.map((item) => {
    if (item.id !== exercise.id) return item
    changed = true
    return {
      ...item,
      self_grade: exercise.self_grade,
      saved: exercise.saved,
      has_solution_body: exercise.has_solution_body,
      has_solution_video: exercise.has_solution_video,
      updated_at: exercise.updated_at,
    }
  })

  if (!changed) return current

  return {
    ...current,
    items,
  }
}
