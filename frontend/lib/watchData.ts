import useSWR from 'swr'
import {
  getWatchSectionId,
  shouldLoadWatchPdfs,
  type WatchContext,
} from '@/lib/watchViewModel'

export type WatchAccessResult = {
  can_access?: boolean
}

export type WatchPdf = {
  id: number
  title: string
  file_url: string
  order: number
}

export function watchContextSWRKey(sectionId: string | number | null | undefined) {
  const parsed = getWatchSectionId(sectionId ?? '')
  if (!parsed) return null
  return `/courses/sections/${parsed}/watch-context`
}

export function watchAccessSWRKey(sectionId: string | number | null | undefined) {
  const parsed = getWatchSectionId(sectionId ?? '')
  if (!parsed) return null
  return `/progress/sections/${parsed}/access`
}

export function watchPdfsSWRKey(sectionId: string | number | null | undefined, context?: WatchContext | null) {
  if (!context || !shouldLoadWatchPdfs(context.section)) return null
  const parsed = getWatchSectionId(sectionId ?? '')
  if (!parsed) return null
  return `/courses/lessons/${parsed}/pdfs`
}

export function useWatchData(sectionId: string | number | null | undefined) {
  const parsedSectionId = getWatchSectionId(sectionId ?? '')
  const contextQuery = useSWR<WatchContext>(watchContextSWRKey(sectionId), {
    keepPreviousData: true,
  })
  const context = contextQuery.data?.section.id === parsedSectionId ? contextQuery.data : null
  const accessQuery = useSWR<WatchAccessResult>(watchAccessSWRKey(sectionId), {
    shouldRetryOnError: false,
  })
  const pdfsQuery = useSWR<WatchPdf[]>(watchPdfsSWRKey(sectionId, context), {
    shouldRetryOnError: false,
  })

  return {
    context,
    contextError: contextQuery.error ?? null,
    loading: contextQuery.isLoading && !context,
    isValidating: contextQuery.isValidating,
    access: accessQuery.data ?? null,
    accessError: accessQuery.error ?? null,
    pdfs: pdfsQuery.data ?? [],
    pdfsError: pdfsQuery.error ?? null,
    mutateContext: contextQuery.mutate,
  }
}
