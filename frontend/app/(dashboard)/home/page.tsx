'use client'

import { useEffect, useMemo, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { useAuthStore } from '@/lib/store'
import { FigmaHomeMain } from '@/components/figma/home'
import { apiDataErrorMessage, apiSWRFetcher } from '@/lib/apiData'
import { useHomeDashboardData } from '@/lib/homeDashboardData'
import { showToastError } from '@/lib/lazyToast'
import { hasSuccessfulSWRCacheData } from '@/lib/swrCache'
import { preloadStudentRouteData } from '@/lib/studentRoutePreload'
import { topicWorkspaceSWRKey } from '@/lib/topicWorkspaceData'
import type { TopicWorkspace } from '@/lib/topicWorkspaceTypes'
import {
  toHomeContinueTopics,
  toHomeSubjectShortcuts,
} from '@/lib/homeDashboardViewModel'

export default function HomePage() {
  const user = useAuthStore((state) => state.user)
  const { cache: swrCache, mutate: mutateSWRCache } = useSWRConfig()
  const {
    topics,
    subjects,
    loading,
    error,
    isValidating,
    retry,
  } = useHomeDashboardData()
  const lastToastErrorRef = useRef('')
  const preloadedTopicWorkspaceKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!error) {
      lastToastErrorRef.current = ''
      return
    }
    const message = apiDataErrorMessage(error, 'Could not load your dashboard.')
    if (message === lastToastErrorRef.current) return
    lastToastErrorRef.current = message
    showToastError(message)
  }, [error])

  async function retryHomeData() {
    try {
      await retry()
    } catch {
      // SWR exposes the latest error through state; the effect above owns user-visible reporting.
    }
  }

  function preloadTopicWorkspace(topicId: string | number) {
    const preloadKey = topicWorkspaceSWRKey(topicId)
    if (preloadKey && hasSuccessfulSWRCacheData(preloadKey, swrCache)) return
    if (!preloadKey || preloadedTopicWorkspaceKeysRef.current.has(preloadKey)) return

    preloadedTopicWorkspaceKeysRef.current.add(preloadKey)
    const request = apiSWRFetcher<TopicWorkspace>(preloadKey).catch((error) => {
      preloadedTopicWorkspaceKeysRef.current.delete(preloadKey)
      throw error
    })

    void mutateSWRCache(preloadKey, request, { populateCache: true, revalidate: false })
  }

  function preloadSubjectRoute(href: string) {
    preloadStudentRouteData(href, mutateSWRCache, { cache: swrCache })
  }

  const firstName = user?.full_name?.split(' ')[0] || 'Student'
  const continueTopics = useMemo(() => toHomeContinueTopics(topics), [topics])
  const subjectShortcuts = useMemo(() => toHomeSubjectShortcuts(subjects), [subjects])

  return (
    <>
      {error && (
        <section role="alert" className="mb-6 flex max-w-[984px] flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#fde68a] bg-[#fffbeb] px-5 py-4">
          <div>
            <p className="m-0 text-[14px] font-black text-[#92400e]">Dashboard data could not be refreshed.</p>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#b45309]">Cached or partial data stays visible while you retry.</p>
          </div>
          <button
            type="button"
            onClick={() => void retryHomeData()}
            disabled={isValidating}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#92400e] px-4 text-[13px] font-black text-white disabled:opacity-60"
          >
            <RotateCcw size={15} />
            {isValidating ? 'Retrying...' : 'Retry dashboard data'}
          </button>
        </section>
      )}
      <FigmaHomeMain
        firstName={firstName}
        subjects={subjectShortcuts}
        continueTopics={continueTopics}
        loading={loading}
        onTopicPreload={preloadTopicWorkspace}
        onSubjectPreload={preloadSubjectRoute}
      />
    </>
  )
}
