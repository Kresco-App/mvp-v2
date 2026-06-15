'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { postJson } from '@/lib/apiClient'

type ProgressCallback = ((currentSeconds: number, progress: number) => void) | undefined
type CompleteCallback = (() => void | Promise<void>) | undefined

type UseVideoProgressOptions = {
  lessonId: string | number
  durationSeconds: number
  isPlaying: boolean
  getCurrentTime: () => number
  getDuration: () => number
  getWatchedSeconds: () => number
  onProgress?: ProgressCallback
  onComplete?: CompleteCallback
  onStopPlayback?: () => void
  completionThreshold?: number
  awaitCompletionSave?: boolean
  completionSaveErrorMessage?: string
  syncOnInterval?: boolean
}

export function isActiveLesson(progressLessonId: string | number, activeLessonId: string | number) {
  return progressLessonId === activeLessonId
}

export function useVideoProgress({
  lessonId,
  durationSeconds,
  isPlaying,
  getCurrentTime,
  getDuration,
  getWatchedSeconds,
  onProgress,
  onComplete,
  onStopPlayback,
  completionThreshold = 0.9,
  awaitCompletionSave = false,
  completionSaveErrorMessage,
  syncOnInterval = true,
}: UseVideoProgressOptions) {
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lessonIdentityRef = useRef(lessonId)
  const completionReportedRef = useRef(false)
  const completionSaveInFlightRef = useRef(false)
  const lastSavedRef = useRef(0)
  const onProgressRef = useRef<ProgressCallback>(onProgress)
  const onCompleteRef = useRef<CompleteCallback>(onComplete)
  const onStopPlaybackRef = useRef<typeof onStopPlayback>(onStopPlayback)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const postWatchedSeconds = useCallback(async (path: string, watchedSeconds: number) => {
    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) {
      return false
    }

    try {
      await postJson(path, {
        watched_seconds: Math.max(0, Math.round(watchedSeconds)),
      })
      return true
    } catch {
      return false
    }
  }, [lessonId])

  const saveProgress = useCallback(async (watchedSeconds: number) => (
    postWatchedSeconds(`/courses/topic-items/${lessonId}/progress`, watchedSeconds)
  ), [lessonId, postWatchedSeconds])

  const saveCompletion = useCallback(async (watchedSeconds: number) => (
    postWatchedSeconds(`/courses/topic-items/${lessonId}/complete`, watchedSeconds)
  ), [lessonId, postWatchedSeconds])

  const currentDuration = useCallback(() => {
    const nativeDuration = Number(getDuration() ?? 0)
    return Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : durationSeconds
  }, [durationSeconds, getDuration])

  const currentWatchedSeconds = useCallback(() => (
    Math.max(0, Math.round(Number(getWatchedSeconds() ?? 0)))
  ), [getWatchedSeconds])

  const reportCompletion = useCallback(async () => {
    if (completionReportedRef.current || completionSaveInFlightRef.current) return false

    if (awaitCompletionSave) {
      completionSaveInFlightRef.current = true
    } else {
      completionReportedRef.current = true
    }

    onStopPlaybackRef.current?.()
    clearProgressInterval()
    const completionSeconds = currentDuration() || durationSeconds

    if (!awaitCompletionSave) {
      void saveCompletion(completionSeconds)
      await onCompleteRef.current?.()
      return true
    }

    const saved = await saveCompletion(completionSeconds)

    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) {
      completionSaveInFlightRef.current = false
      return false
    }

    if (awaitCompletionSave && !saved) {
      completionSaveInFlightRef.current = false
      completionReportedRef.current = false
      if (completionSaveErrorMessage) toast.error(completionSaveErrorMessage)
      return false
    }

    completionReportedRef.current = true
    completionSaveInFlightRef.current = false
    await onCompleteRef.current?.()
    return true
  }, [
    awaitCompletionSave,
    clearProgressInterval,
    completionSaveErrorMessage,
    currentDuration,
    durationSeconds,
    lessonId,
    saveCompletion,
  ])

  const syncProgress = useCallback(() => {
    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) return

    const current = Number(getCurrentTime() ?? 0)
    const duration = currentDuration()
    const progress = duration > 0 ? current / duration : 0

    onProgressRef.current?.(current, progress)

    if (progress >= completionThreshold) {
      void reportCompletion()
    }
  }, [completionThreshold, currentDuration, getCurrentTime, lessonId, reportCompletion])

  useEffect(() => {
    onProgressRef.current = onProgress
    onCompleteRef.current = onComplete
    onStopPlaybackRef.current = onStopPlayback
  }, [onComplete, onProgress, onStopPlayback])

  useEffect(() => {
    lessonIdentityRef.current = lessonId
    completionReportedRef.current = false
    completionSaveInFlightRef.current = false
    lastSavedRef.current = 0
    clearProgressInterval()
  }, [clearProgressInterval, lessonId])

  useEffect(() => {
    if (!isPlaying) {
      clearProgressInterval()
      return
    }

    const activeLessonId = lessonId
    const intervalId = setInterval(() => {
      if (!isActiveLesson(activeLessonId, lessonIdentityRef.current)) return
      if (syncOnInterval) syncProgress()

      const current = Math.round(Number(getCurrentTime() ?? 0))
      if (current !== lastSavedRef.current) {
        lastSavedRef.current = current
        void saveProgress(current)
      }
    }, 30000)
    progressIntervalRef.current = intervalId

    return () => {
      clearInterval(intervalId)
      if (progressIntervalRef.current === intervalId) {
        progressIntervalRef.current = null
      }
    }
  }, [
    clearProgressInterval,
    getCurrentTime,
    isPlaying,
    lessonId,
    saveProgress,
    syncOnInterval,
    syncProgress,
  ])

  useEffect(() => {
    const flushProgress = () => {
      void saveProgress(currentWatchedSeconds())
    }
    window.addEventListener('pagehide', flushProgress)
    return () => {
      window.removeEventListener('pagehide', flushProgress)
    }
  }, [currentWatchedSeconds, saveProgress])

  return {
    clearProgressInterval,
    currentDuration,
    currentWatchedSeconds,
    reportCompletion,
    saveProgress,
    syncProgress,
  }
}
