'use client'

/* oxlint-disable react-doctor/effect-needs-cleanup -- VdoCipher exposes player events asynchronously; this file cleans them through the resolved effect cleanup. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { getJson } from '@/lib/apiClient'
import { showToastError } from '@/lib/lazyToast'
import { useNearViewport } from '@/hooks/useNearViewport'
import { useVideoProgress } from '@/hooks/useVideoProgress'

export { isActiveLesson } from '@/hooks/useVideoProgress'

const VDO_API_SRC = 'https://player.vdocipher.com/v2/api.js'
const STREAM_DATA_CACHE_TTL_MS = 60_000
const STREAM_DATA_CACHE_MAX_ENTRIES = 24

export type StreamData = {
  otp?: string | null
  playback_info?: string | null
  watched_seconds?: number | null
  resume_seconds?: number | null
} | null

type LessonStreamState = {
  topicItemId: string | number | null
  data: StreamData
}

type VdoCipherVideoElement = HTMLVideoElement & {
  currentTime: number
  duration?: number
}

type VdoCipherPlayer = {
  video?: VdoCipherVideoElement
  destroy?: () => void
}

type VdoCipherApi = {
  getInstance: (iframe: HTMLIFrameElement) => VdoCipherPlayer | null
}

type ProgressCallback = ((currentSeconds: number, progress: number) => void) | undefined
type CompleteCallback = (() => void | Promise<void>) | undefined

declare global {
  interface Window {
    VdoPlayer?: VdoCipherApi
  }
}

let vdoApiPromise: Promise<VdoCipherApi> | null = null
const lessonStreamDataCache = new Map<string, { data: StreamData; cachedAt: number }>()
const lessonStreamDataRequests = new Map<string, Promise<StreamData>>()

export function buildVdoCipherIframeSrc(streamData: StreamData) {
  const otp = encodeURIComponent(streamData?.otp ?? '')
  const playbackInfo = encodeURIComponent(streamData?.playback_info ?? '')
  return `https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}&player=&`
}

export function resolveLessonStreamData(streamState: LessonStreamState, topicItemId: string | number) {
  return streamState?.topicItemId === topicItemId ? streamState.data : null
}

export function readLessonStreamDataCache(topicItemId: string | number, now = Date.now()) {
  const cacheKey = lessonStreamDataCacheKey(topicItemId)
  const cached = lessonStreamDataCache.get(cacheKey)
  if (!cached) return null
  if (now - cached.cachedAt > STREAM_DATA_CACHE_TTL_MS) {
    lessonStreamDataCache.delete(cacheKey)
    return null
  }
  return cached.data
}

export function clearLessonStreamDataCache() {
  lessonStreamDataCache.clear()
  lessonStreamDataRequests.clear()
}

async function loadLessonStreamData(topicItemId: string | number) {
  const cached = readLessonStreamDataCache(topicItemId)
  if (cached) return cached

  const cacheKey = lessonStreamDataCacheKey(topicItemId)
  const existing = lessonStreamDataRequests.get(cacheKey)
  if (existing) return existing

  const request = getJson<StreamData>(lessonStreamEndpoint(topicItemId))
    .then((data) => {
      if (data) writeLessonStreamDataCache(topicItemId, data)
      return data
    })
    .finally(() => {
      lessonStreamDataRequests.delete(cacheKey)
    })

  lessonStreamDataRequests.set(cacheKey, request)
  return request
}

function writeLessonStreamDataCache(topicItemId: string | number, data: StreamData) {
  const cacheKey = lessonStreamDataCacheKey(topicItemId)
  lessonStreamDataCache.delete(cacheKey)
  lessonStreamDataCache.set(cacheKey, { data, cachedAt: Date.now() })
  pruneLessonStreamDataCache()
}

function pruneLessonStreamDataCache() {
  while (lessonStreamDataCache.size > STREAM_DATA_CACHE_MAX_ENTRIES) {
    const oldestKey = lessonStreamDataCache.keys().next().value
    if (oldestKey === undefined) return
    lessonStreamDataCache.delete(oldestKey)
  }
}

function lessonStreamDataCacheKey(topicItemId: string | number) {
  return String(topicItemId)
}

function lessonStreamEndpoint(topicItemId: string | number) {
  return `/courses/topic-items/${encodeURIComponent(String(topicItemId))}/stream`
}

function loadVdoApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('VdoCipher API can only load in the browser.'))
  }

  if (window.VdoPlayer?.getInstance) {
    return Promise.resolve(window.VdoPlayer)
  }

  if (vdoApiPromise) {
    return vdoApiPromise
  }

  vdoApiPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.VdoPlayer?.getInstance) {
        resolve(window.VdoPlayer)
        return
      }

      vdoApiPromise = null
      reject(new Error('VdoCipher player API did not expose getInstance().'))
    }

    const fail = () => {
      vdoApiPromise = null
      reject(new Error('Failed to load VdoCipher player API.'))
    }

    const existingScript = document.querySelector(`script[src="${VDO_API_SRC}"]`)
    if (existingScript) {
      if (window.VdoPlayer?.getInstance) {
        finish()
        return
      }

      existingScript.addEventListener('load', finish, { once: true })
      existingScript.addEventListener('error', fail, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = VDO_API_SRC
    script.async = true
    script.onload = finish
    script.onerror = fail
    document.head.appendChild(script)
  })

  return vdoApiPromise
}

type VideoPlayerProps = {
  /** Deprecated prop name; the value now represents a topic item id. */
  lessonId: string | number
  durationSeconds: number
  resumeSeconds?: number
  onProgress?: ProgressCallback
  onComplete?: CompleteCallback
}

export default function VideoPlayer({ lessonId, durationSeconds, resumeSeconds = 0, onProgress, onComplete }: VideoPlayerProps) {
  const { nearViewport, ref: viewportRef } = useNearViewport<HTMLDivElement>()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<VdoCipherPlayer | null>(null)
  const [streamState, setStreamState] = useState<LessonStreamState>({ topicItemId: null, data: null })
  const streamData = resolveLessonStreamData(streamState, lessonId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const initialSeekDoneRef = useRef(false)

  const currentResumeSeconds = useCallback(() => {
    const streamResume = Number(streamData?.resume_seconds ?? 0)
    const propResume = Number(resumeSeconds || 0)
    return Math.max(0, Math.round(streamResume || propResume))
  }, [resumeSeconds, streamData?.resume_seconds])

  const currentWatchedSeconds = useCallback(() => {
    const current = Math.round(playerRef.current?.video?.currentTime ?? 0)
    const streamWatched = Number(streamData?.watched_seconds ?? 0)
    const propResume = Number(resumeSeconds || 0)
    return Math.max(0, current, Math.round(streamWatched || propResume))
  }, [resumeSeconds, streamData?.watched_seconds])

  const getCurrentTime = useCallback(() => playerRef.current?.video?.currentTime ?? 0, [])
  const getDuration = useCallback(() => playerRef.current?.video?.duration ?? 0, [])

  const {
    clearProgressInterval,
    reportCompletion,
    saveProgress,
    syncProgress,
  } = useVideoProgress({
    lessonId,
    durationSeconds,
    isPlaying,
    getCurrentTime,
    getDuration,
    getWatchedSeconds: currentWatchedSeconds,
    onProgress,
    onComplete,
    onStopPlayback: () => setIsPlaying(false),
    awaitCompletionSave: true,
    completionSaveErrorMessage: 'Could not save video completion.',
    syncOnInterval: false,
  })

  useEffect(() => {
    if (!nearViewport) return undefined

    initialSeekDoneRef.current = false
    clearProgressInterval()

    let cancelled = false

    async function fetchStream() {
      const cachedStreamData = readLessonStreamDataCache(lessonId)
      setLoading(!cachedStreamData)
      setError(null)
      setStreamState({ topicItemId: lessonId, data: cachedStreamData })
      try {
        const data = await loadLessonStreamData(lessonId)
        if (cancelled) return
        setStreamState({ topicItemId: lessonId, data })
      } catch (err) {
        if (cancelled) return
        setStreamState({ topicItemId: lessonId, data: null })
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur de chargement de la video.'
        setError(msg)
        showToastError(msg)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchStream()

    return () => {
      cancelled = true
      clearProgressInterval()
    }
  }, [clearProgressInterval, lessonId, nearViewport])

  useEffect(() => {
    if (!nearViewport || !streamData || !iframeRef.current) return

    let cancelled = false
    let cleanupVideoEvents: (() => void) | null = null

    clearProgressInterval()

    loadVdoApi()
      .then((VdoPlayer) => {
        if (cancelled || !iframeRef.current) return

        const player = VdoPlayer.getInstance(iframeRef.current)
        const video = player?.video

        if (!player || !video) {
          throw new Error('VdoCipher player instance is unavailable.')
        }

        playerRef.current = player
        const resumeAt = currentResumeSeconds()
        if (!initialSeekDoneRef.current && resumeAt > 0) {
          video.currentTime = resumeAt
          initialSeekDoneRef.current = true
        }

        const handlePlay = () => {
          setIsPlaying(true)
        }

        const handlePause = () => {
          setIsPlaying(false)
        }

        const handleEnded = () => {
          void reportCompletion()
        }

        video.addEventListener('play', handlePlay)
        video.addEventListener('pause', handlePause)
        video.addEventListener('ended', handleEnded)
        video.addEventListener('timeupdate', syncProgress)

        cleanupVideoEvents = () => {
          video.removeEventListener('play', handlePlay)
          video.removeEventListener('pause', handlePause)
          video.removeEventListener('ended', handleEnded)
          video.removeEventListener('timeupdate', syncProgress)
        }
      })
      .catch((err) => {
        if (cancelled) return

        const msg = (err as Error)?.message || "Erreur d'initialisation du lecteur video."
        setError(msg)
        showToastError(msg)
      })

    return () => {
      cancelled = true
      void saveProgress(currentWatchedSeconds())
      cleanupVideoEvents?.()
      clearProgressInterval()
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
  }, [
    clearProgressInterval,
    currentResumeSeconds,
    currentWatchedSeconds,
    lessonId,
    reportCompletion,
    saveProgress,
    streamData,
    syncProgress,
    nearViewport,
  ])

  if (error) {
    return (
      <div ref={viewportRef} className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center p-8">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-white font-semibold">Video indisponible</p>
          <p className="text-slate-400 text-sm max-w-xs">{error}</p>
        </div>
      </div>
    )
  }

  if (loading || !streamData) {
    return (
      <div ref={viewportRef} className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
          <span className="text-slate-400 text-sm">Chargement de la video...</span>
        </div>
      </div>
    )
  }

  const iframeSrc = buildVdoCipherIframeSrc(streamData)

  return (
    <div ref={viewportRef} className="aspect-video bg-slate-950 rounded-2xl overflow-hidden">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="VdoCipher lesson video player"
        allow="encrypted-media"
        allowFullScreen
        sandbox="allow-scripts allow-presentation"
        className="h-full w-full border-0"
      />
    </div>
  )
}
