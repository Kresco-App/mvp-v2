'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import { FigmaHomeMain } from '@/components/figma'
import {
  toHomeContinueTopics,
  toHomeSubjectShortcuts,
  type HomeSubjectCard,
  type HomeTopicCard,
} from '@/lib/homeDashboardViewModel'

export default function HomePage() {
  const { user } = useAuthStore()
  const [topics, setTopics] = useState<HomeTopicCard[]>([])
  const [subjects, setSubjects] = useState<HomeSubjectCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'Home - Kresco' }, [])

  useEffect(() => {
    let alive = true

    async function loadHome() {
      const [topicsResult, subjectsResult] = await Promise.all([
        api.get('/courses/topics').then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }),
        ),
        api.get('/courses/subjects').then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }),
        ),
      ])

      if (!alive) return

      if (topicsResult.status === 'fulfilled') {
        setTopics(Array.isArray(topicsResult.value.data) ? topicsResult.value.data : [])
      } else {
        toast.error('Could not load your dashboard.')
      }

      if (subjectsResult.status === 'fulfilled') {
        setSubjects(Array.isArray(subjectsResult.value.data) ? subjectsResult.value.data : [])
      }

      setLoading(false)
    }

    loadHome()

    return () => {
      alive = false
    }
  }, [])

  const firstName = user?.full_name?.split(' ')[0] || 'Student'
  const continueTopics = useMemo(() => toHomeContinueTopics(topics), [topics])
  const subjectShortcuts = useMemo(() => toHomeSubjectShortcuts(subjects), [subjects])

  return (
    <FigmaHomeMain
      firstName={firstName}
      subjects={subjectShortcuts}
      continueTopics={continueTopics}
      loading={loading}
    />
  )
}
