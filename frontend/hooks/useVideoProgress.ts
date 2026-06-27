'use client'

import { useCallback, useEffect, useRef } from 'react'
import { postJson, postJsonKeepalive } from '@/lib/apiClient'
import { showToastError } from '@/lib/lazyToast'

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

function isVideoProgressDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden
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
  const progressSaveInFlightRef = useRef<{
    token: symbol
    watchedSeconds: number
    request: Promise<boolean>
  } | null>(null)
  const onProgressRef = useRef<ProgressCallback>(onProgress)
  const onCompleteRef = useRef<CompleteCallback>(onComplete)
  const onStopPlaybackRef = useRef<typeof onStopPlayback>(onStopPlayback)
  const saveProgressRef = useRef<(watchedSeconds: number) => Promise<boolean>>(async () => false)
  const saveProgressWithKeepaliveRef = useRef<(watchedSeconds: number) => boolean>(() => false)
  const currentWatchedSecondsRef = useRef<() => number>(() => 0)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const flushProgress = useCallback(() => {
    const watchedSeconds = currentWatchedSecondsRef.current()
    if (!saveProgressWithKeepaliveRef.current(watchedSeconds)) {
      void saveProgressRef.current(watchedSeconds)
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

  const postWatchedSecondsKeepalive = useCallback((path: string, watchedSeconds: number) => {
    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) {
      return null
    }

    return postJsonKeepalive(path, {
      watched_seconds: Math.max(0, Math.round(watchedSeconds)),
    })
  }, [lessonId])

  const saveProgress = useCallback(async (watchedSeconds: number) => {
    if (completionReportedRef.current || completionSaveInFlightRef.current) return true

    const roundedWatchedSeconds = Math.max(0, Math.round(watchedSeconds))
    if (roundedWatchedSeconds <= 0) return false
    if (roundedWatchedSeconds === lastSavedRef.current) return true

    const inFlight = progressSaveInFlightRef.current
    if (inFlight?.watchedSeconds === roundedWatchedSeconds) {
      return inFlight.request
    }

    const token = Symbol('video-progress-save')
    const request = postWatchedSeconds(`/courses/topic-items/${lessonId}/progress`, roundedWatchedSeconds)
      .then((saved) => {
        if (saved) lastSavedRef.current = roundedWatchedSeconds
        return saved
      })
      .finally(() => {
        if (progressSaveInFlightRef.current?.token === token) {
          progressSaveInFlightRef.current = null
        }
      })

    progressSaveInFlightRef.current = {
      token,
      watchedSeconds: roundedWatchedSeconds,
      request,
    }
    return request
  }, [lessonId, postWatchedSeconds])

  const saveProgressWithKeepalive = useCallback((watchedSeconds: number) => {
    if (completionReportedRef.current || completionSaveInFlightRef.current) return false

    const roundedWatchedSeconds = Math.max(0, Math.round(watchedSeconds))
    if (roundedWatchedSeconds <= 0) return false
    if (roundedWatchedSeconds === lastSavedRef.current) return true

    const inFlight = progressSaveInFlightRef.current
    if (inFlight?.watchedSeconds === roundedWatchedSeconds) return true

    const request = postWatchedSecondsKeepalive(`/courses/topic-items/${lessonId}/progress`, roundedWatchedSeconds)
    if (!request) return false

    const token = Symbol('video-progress-keepalive-save')
    const trackedRequest = request
      .then((saved) => {
        if (saved) lastSavedRef.current = roundedWatchedSeconds
        return saved
      })
      .finally(() => {
        if (progressSaveInFlightRef.current?.token === token) {
          progressSaveInFlightRef.current = null
        }
      })

    progressSaveInFlightRef.current = {
      token,
      watchedSeconds: roundedWatchedSeconds,
      request: trackedRequest,
    }
    return true
  }, [lessonId, postWatchedSecondsKeepalive])

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

  useEffect(() => {
    saveProgressRef.current = saveProgress
    saveProgressWithKeepaliveRef.current = saveProgressWithKeepalive
    currentWatchedSecondsRef.current = currentWatchedSeconds
  }, [currentWatchedSeconds, saveProgress, saveProgressWithKeepalive])

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
      if (completionSaveErrorMessage) showToastError(completionSaveErrorMessage)
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

  const startProgressInterval = useCallback(() => {
    if (progressIntervalRef.current || isVideoProgressDocumentHidden()) return

    const activeLessonId = lessonId
    const intervalId = setInterval(() => {
      if (!isActiveLesson(activeLessonId, lessonIdentityRef.current)) return
      if (isVideoProgressDocumentHidden()) {
        flushProgress()
        clearProgressInterval()
        return
      }
      if (syncOnInterval) syncProgress()

      const current = Math.round(Number(getCurrentTime() ?? 0))
      void saveProgress(current)
    }, 30000)
    progressIntervalRef.current = intervalId
  }, [
    clearProgressInterval,
    flushProgress,
    getCurrentTime,
    lessonId,
    saveProgress,
    syncOnInterval,
    syncProgress,
  ])

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
    progressSaveInFlightRef.current = null
    clearProgressInterval()
  }, [clearProgressInterval, lessonId])

  useEffect(() => {
    if (!isPlaying) {
      clearProgressInterval()
      return
    }

    startProgressInterval()
    return clearProgressInterval
  }, [clearProgressInterval, isPlaying, startProgressInterval])

  useEffect(() => {
    if (!isPlaying || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return

    const handleVisibilityChange = () => {
      if (isVideoProgressDocumentHidden()) {
        flushProgress()
        clearProgressInterval()
        return
      }

      syncProgress()
      flushProgress()
      startProgressInterval()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [clearProgressInterval, flushProgress, isPlaying, startProgressInterval, syncProgress])

  useEffect(() => {
    window.addEventListener('pagehide', flushProgress)
    return () => {
      window.removeEventListener('pagehide', flushProgress)
    }
  }, [flushProgress])

  return {
    clearProgressInterval,
    currentDuration,
    currentWatchedSeconds,
    reportCompletion,
    saveProgress,
    syncProgress,
  }
}
