'use client'

/* oxlint-disable react-doctor/effect-needs-cleanup -- VdoCipher exposes player events asynchronously; this file cleans them through the resolved effect cleanup. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Play } from 'lucide-react'
import { getJson, postJson } from '@/lib/apiClient'
import { isLocalDemoVideoStream } from '@/lib/devFeatures'

const VDO_API_SRC = 'https://player.vdocipher.com/v2/api.js'

type StreamData = {
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

export function buildVdoCipherIframeSrc(streamData: StreamData) {
  const otp = encodeURIComponent(streamData?.otp ?? '')
  const playbackInfo = encodeURIComponent(streamData?.playback_info ?? '')
  return `https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}&player=&`
}

export function resolveLessonStreamData(streamState: LessonStreamState, topicItemId: string | number) {
  return streamState?.topicItemId === topicItemId ? streamState.data : null
}

export function isActiveLesson(progressLessonId: string | number, activeLessonId: string | number) {
  return progressLessonId === activeLessonId
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<VdoCipherPlayer | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lessonIdentityRef = useRef(lessonId)
  const completionReportedRef = useRef(false)
  const completionSaveInFlightRef = useRef(false)
  const onProgressRef = useRef<ProgressCallback>(onProgress)
  const onCompleteRef = useRef<CompleteCallback>(onComplete)
  const [streamState, setStreamState] = useState<LessonStreamState>({ topicItemId: null, data: null })
  const streamData = resolveLessonStreamData(streamState, lessonId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const lastSavedRef = useRef(0)
  const initialSeekDoneRef = useRef(false)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const saveProgress = useCallback(async (watchedSeconds: number) => {
    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) {
      return false
    }

    try {
      await postJson(`/courses/topic-items/${lessonId}/complete`, {
        watched_seconds: Math.max(0, Math.round(watchedSeconds)),
      })
      return true
    } catch {
      return false
    }
  }, [lessonId])

  const currentDuration = useCallback(() => {
    const nativeDuration = playerRef.current?.video?.duration ?? 0
    return Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : durationSeconds
  }, [durationSeconds])

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

  const reportCompletion = useCallback(async () => {
    if (completionReportedRef.current || completionSaveInFlightRef.current) return

    completionSaveInFlightRef.current = true
    setIsPlaying(false)
    clearProgressInterval()
    const saved = await saveProgress(currentDuration() || durationSeconds)
    if (!isActiveLesson(lessonId, lessonIdentityRef.current)) {
      completionSaveInFlightRef.current = false
      return
    }
    if (!saved) {
      completionSaveInFlightRef.current = false
      completionReportedRef.current = false
      toast.error('Could not save video completion.')
      return
    }
    completionReportedRef.current = true
    completionSaveInFlightRef.current = false
    await onCompleteRef.current?.()
  }, [clearProgressInterval, currentDuration, durationSeconds, lessonId, saveProgress])

  useEffect(() => {
    onProgressRef.current = onProgress
    onCompleteRef.current = onComplete
  }, [onComplete, onProgress])

  useEffect(() => {
    lessonIdentityRef.current = lessonId
    completionReportedRef.current = false
    completionSaveInFlightRef.current = false
    lastSavedRef.current = 0
    initialSeekDoneRef.current = false
    clearProgressInterval()

    let cancelled = false

    async function fetchStream() {
      setLoading(true)
      setError(null)
      setStreamState({ topicItemId: lessonId, data: null })
      try {
        const data = (await getJson(`/courses/topic-items/${lessonId}/stream`)) as StreamData
        if (cancelled) return
        setStreamState({ topicItemId: lessonId, data })
      } catch (err) {
        if (cancelled) return
        setStreamState({ topicItemId: lessonId, data: null })
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erreur de chargement de la video.'
        setError(msg)
        toast.error(msg)
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }

    fetchStream()

    return () => {
      cancelled = true
      clearProgressInterval()
    }
  }, [clearProgressInterval, lessonId])

  useEffect(() => {
    if (!streamData || !iframeRef.current) return

    if (isLocalDemoVideoStream(streamData)) return

    let cancelled = false
    let cleanupVideoEvents: (() => void) | null = null
    let activePlayer: VdoCipherPlayer | null = null

    const activeLessonId = lessonId
    clearProgressInterval()

    const syncProgress = () => {
      if (!isActiveLesson(activeLessonId, lessonIdentityRef.current)) {
        return
      }

      const current = activePlayer?.video?.currentTime ?? 0
      const duration = currentDuration()
      const pct = duration > 0 ? current / duration : 0

      onProgressRef.current?.(current, pct)

      if (pct >= 0.9) {
        void reportCompletion()
      }
    }

    loadVdoApi()
      .then((VdoPlayer) => {
        if (cancelled || !iframeRef.current) return

        const player = VdoPlayer.getInstance(iframeRef.current)
        const video = player?.video

        if (!player || !video) {
          throw new Error('VdoCipher player instance is unavailable.')
        }

        playerRef.current = player
        activePlayer = player
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
        toast.error(msg)
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
    currentDuration,
    currentResumeSeconds,
    currentWatchedSeconds,
    durationSeconds,
    lessonId,
    reportCompletion,
    saveProgress,
    streamData,
  ])

  useEffect(() => {
    if (!isPlaying) {
      clearProgressInterval()
      return
    }

    const activeLessonId = lessonId
    const intervalId = setInterval(() => {
      if (!isActiveLesson(activeLessonId, lessonIdentityRef.current)) {
        return
      }

      const current = Math.round(playerRef.current?.video?.currentTime ?? 0)
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
  }, [clearProgressInterval, isPlaying, lessonId, saveProgress])

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
      <div className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center">
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
      <div className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Chargement de la video...</span>
        </div>
      </div>
    )
  }

  if (isLocalDemoVideoStream(streamData)) {
    return (
      <div className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-slate-950" />
        <div className="relative flex flex-col items-center gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-slate-900/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <Play size={28} className="text-white fill-white ml-1" />
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Apercu video local</p>
            <p className="text-slate-400 text-sm">
              Le lecteur VdoCipher apparaitra ici quand la source video sera configuree.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void reportCompletion().then(() => {
                if (completionReportedRef.current) {
                  toast.success('Lecon marquee comme terminee !')
                }
              })
            }}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Marquer comme terminee
          </button>
        </div>
      </div>
    )
  }

  const iframeSrc = buildVdoCipherIframeSrc(streamData)

  return (
    <div className="aspect-video bg-slate-950 rounded-2xl overflow-hidden">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        allow="encrypted-media"
        allowFullScreen
        sandbox="allow-scripts allow-presentation"
        className="w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  )
}
