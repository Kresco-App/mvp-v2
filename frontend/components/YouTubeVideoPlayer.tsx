'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { postJson } from '@/lib/apiClient'

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
const YOUTUBE_NOCOOKIE_HOST = 'https://www.youtube-nocookie.com'
const YOUTUBE_PLAYING_STATE = 1
const YOUTUBE_PAUSED_STATE = 2
const YOUTUBE_ENDED_STATE = 0

type ProgressCallback = ((currentSeconds: number, progress: number) => void) | undefined
type CompleteCallback = (() => void) | undefined

type YouTubePlayer = {
  destroy?: () => void
  getCurrentTime?: () => number
  getDuration?: () => number
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void
}

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId: string
    host: string
    playerVars: Record<string, string | number>
    events: {
      onReady: () => void
      onStateChange: (event: { data: number }) => void
      onError: () => void
    }
  },
) => YouTubePlayer

type YouTubeApi = {
  Player: YouTubePlayerConstructor
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null

export function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube player API can only load in the browser.'))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (window.YT?.Player) {
        resolve(window.YT)
        return
      }
      youtubeApiPromise = null
      reject(new Error('YouTube player API did not expose Player.'))
    }

    const existingScript = document.querySelector(`script[src="${YOUTUBE_API_SRC}"]`)
    if (existingScript) {
      existingScript.addEventListener('error', () => {
        youtubeApiPromise = null
        reject(new Error('Failed to load YouTube player API.'))
      }, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = YOUTUBE_API_SRC
    script.async = true
    script.onerror = () => {
      youtubeApiPromise = null
      reject(new Error('Failed to load YouTube player API.'))
    }
    document.head.appendChild(script)
  })

  return youtubeApiPromise
}

export function buildYouTubePlayerVars() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return {
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    enablejsapi: 1,
    origin,
  }
}

function activeLessonMatches(progressLessonId: string | number, activeLessonId: string | number) {
  return progressLessonId === activeLessonId
}

type YouTubeVideoPlayerProps = {
  lessonId: string | number
  videoId: string
  durationSeconds: number
  resumeSeconds?: number
  onProgress?: ProgressCallback
  onComplete?: CompleteCallback
}

export default function YouTubeVideoPlayer({
  lessonId,
  videoId,
  durationSeconds,
  resumeSeconds = 0,
  onProgress,
  onComplete,
}: YouTubeVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lessonIdentityRef = useRef(lessonId)
  const completionReportedRef = useRef(false)
  const onProgressRef = useRef<ProgressCallback>(onProgress)
  const onCompleteRef = useRef<CompleteCallback>(onComplete)
  const lastSavedRef = useRef(0)
  const initialSeekDoneRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const saveProgress = useCallback(async (watchedSeconds: number) => {
    if (!activeLessonMatches(lessonId, lessonIdentityRef.current)) return
    try {
      await postJson(`/courses/topic-items/${lessonId}/complete`, {
        watched_seconds: Math.max(0, Math.round(watchedSeconds)),
      })
    } catch {
      // Playback should not be interrupted by transient progress-save failures.
    }
  }, [lessonId])

  const currentDuration = useCallback(() => {
    const playerDuration = playerRef.current?.getDuration?.() ?? 0
    return playerDuration > 0 ? playerDuration : durationSeconds
  }, [durationSeconds])

  const currentResumeSeconds = useCallback(() => (
    Math.max(0, Math.round(Number(resumeSeconds || 0)))
  ), [resumeSeconds])

  const currentWatchedSeconds = useCallback(() => (
    Math.max(0, Math.round(playerRef.current?.getCurrentTime?.() ?? currentResumeSeconds()))
  ), [currentResumeSeconds])

  const reportCompletion = useCallback(() => {
    if (completionReportedRef.current) return
    completionReportedRef.current = true
    setIsPlaying(false)
    clearProgressInterval()
    void saveProgress(currentDuration() || durationSeconds)
    onCompleteRef.current?.()
  }, [clearProgressInterval, currentDuration, durationSeconds, saveProgress])

  const syncProgress = useCallback(() => {
    if (!activeLessonMatches(lessonId, lessonIdentityRef.current)) return
    const current = playerRef.current?.getCurrentTime?.() ?? 0
    const duration = currentDuration()
    const progress = duration > 0 ? current / duration : 0
    onProgressRef.current?.(current, progress)
    if (progress >= 0.9) {
      reportCompletion()
    }
  }, [currentDuration, lessonId, reportCompletion])

  useEffect(() => {
    onProgressRef.current = onProgress
    onCompleteRef.current = onComplete
  }, [onComplete, onProgress])

  useEffect(() => {
    lessonIdentityRef.current = lessonId
    completionReportedRef.current = false
    lastSavedRef.current = 0
    initialSeekDoneRef.current = false
    clearProgressInterval()
    setLoading(true)
    setError(null)

    let cancelled = false

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        const player = new YT.Player(containerRef.current, {
          videoId,
          host: YOUTUBE_NOCOOKIE_HOST,
          playerVars: buildYouTubePlayerVars(),
          events: {
            onReady: () => {
              const resumeAt = currentResumeSeconds()
              if (!initialSeekDoneRef.current && resumeAt > 0) {
                player.seekTo?.(resumeAt, true)
                initialSeekDoneRef.current = true
              }
              if (!cancelled) setLoading(false)
            },
            onStateChange: (event) => {
              if (event.data === YOUTUBE_PLAYING_STATE) {
                setIsPlaying(true)
                syncProgress()
                return
              }
              if (event.data === YOUTUBE_PAUSED_STATE) {
                setIsPlaying(false)
                syncProgress()
                return
              }
              if (event.data === YOUTUBE_ENDED_STATE) {
                reportCompletion()
              }
            },
            onError: () => {
              if (cancelled) return
              const msg = 'YouTube video unavailable.'
              setError(msg)
              setLoading(false)
              toast.error(msg)
            },
          },
        })
        playerRef.current = player
      })
      .catch((err) => {
        if (cancelled) return
        const msg = (err as Error)?.message || 'Failed to load YouTube player.'
        setError(msg)
        setLoading(false)
        toast.error(msg)
      })

    return () => {
      cancelled = true
      void saveProgress(currentWatchedSeconds())
      clearProgressInterval()
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
  }, [clearProgressInterval, currentResumeSeconds, currentWatchedSeconds, lessonId, reportCompletion, saveProgress, syncProgress, videoId])

  useEffect(() => {
    if (!isPlaying) {
      clearProgressInterval()
      return
    }

    const activeLessonId = lessonId
    const intervalId = setInterval(() => {
      if (!activeLessonMatches(activeLessonId, lessonIdentityRef.current)) return
      syncProgress()
      const current = Math.round(playerRef.current?.getCurrentTime?.() ?? 0)
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
  }, [clearProgressInterval, isPlaying, lessonId, saveProgress, syncProgress])

  useEffect(() => {
    const flushProgress = () => {
      void saveProgress(currentWatchedSeconds())
    }
    window.addEventListener('pagehide', flushProgress)
    return () => {
      window.removeEventListener('pagehide', flushProgress)
    }
  }, [currentWatchedSeconds, saveProgress])

  if (error) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center bg-slate-950">
        <div className="flex max-w-xs flex-col items-center gap-3 p-8 text-center">
          <AlertCircle size={36} className="text-red-400" />
          <p className="font-semibold text-white">Video unavailable</p>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[260px] bg-slate-950">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="text-sm text-slate-400">Loading YouTube video...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
