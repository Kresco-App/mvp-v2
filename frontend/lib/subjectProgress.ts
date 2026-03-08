'use client'

import api from '@/lib/axios'

export interface SubjectPlanData {
  completed_lesson_ids: number[]
  completed_block_ids: number[]
  completed_quiz_ids: number[]
  completed_section_ids?: number[]
  total_section_count?: number
  total_lesson_count?: number
}

export interface SubjectProgressSummary {
  completedCount: number
  totalCount: number
  percentage: number
  unitLabel: string
}

export async function fetchSubjectPlan(subjectId: number | string) {
  const response = await api.get(`/progress/subject-plan/${subjectId}`)
  return response.data as SubjectPlanData
}

export function buildSubjectProgressSummary(
  plan: SubjectPlanData,
  fallbackTotalLessons = 0,
): SubjectProgressSummary {
  const completedSections = plan.completed_section_ids?.length ?? 0
  const totalSections = plan.total_section_count ?? 0

  if (totalSections > 0 || completedSections > 0) {
    return {
      completedCount: completedSections,
      totalCount: totalSections,
      percentage: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
      unitLabel: totalSections === 1 ? 'section' : 'sections',
    }
  }

  const completedLessons = plan.completed_lesson_ids?.length ?? 0
  const totalLessons = plan.total_lesson_count ?? fallbackTotalLessons

  return {
    completedCount: completedLessons,
    totalCount: totalLessons,
    percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    unitLabel: totalLessons === 1 ? 'lecon' : 'lecons',
  }
}

export async function fetchSubjectProgressSummary(
  subjectId: number | string,
  fallbackTotalLessons = 0,
) {
  const plan = await fetchSubjectPlan(subjectId)
  return buildSubjectProgressSummary(plan, fallbackTotalLessons)
}
