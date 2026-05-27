'use client'

/* oxlint-disable react-doctor/effect-needs-cleanup -- VdoCipher exposes player events asynchronously; this file cleans them through the resolved effect cleanup. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Play } from 'lucide-react'
import api from '@/lib/axios'
import { isLocalDemoVideoStream } from '@/lib/devFeatures'

const VDO_API_SRC = 'https://player.vdocipher.com/v2/api.js'

let vdoApiPromise = null

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

export default function VideoPlayer({ lessonId, durationSeconds, onProgress, onComplete }) {
  const iframeRef = useRef(null)
  const playerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const completionReportedRef = useRef(false)
  const onProgressRef = useRef(onProgress)
  const onCompleteRef = useRef(onComplete)
  const [streamData, setStreamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const lastSavedRef = useRef(0)

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const saveProgress = useCallback(async (watchedSeconds) => {
    try {
      await api.post('/progress/update', {
        lesson_id: lessonId,
        watched_seconds: watchedSeconds,
      })
    } catch {
      // Silent: not critical.
    }
  }, [lessonId])

  const reportCompletion = useCallback(() => {
    if (completionReportedRef.current) return

    completionReportedRef.current = true
    setIsPlaying(false)
    clearProgressInterval()
    void saveProgress(durationSeconds)
    onCompleteRef.current?.()
  }, [clearProgressInterval, durationSeconds, saveProgress])

  useEffect(() => {
    onProgressRef.current = onProgress
    onCompleteRef.current = onComplete
  }, [onComplete, onProgress])

  useEffect(() => {
    let cancelled = false

    async function fetchStream() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`/courses/sections/${lessonId}/stream`)
        if (cancelled) return
        setStreamData(data)
      } catch (err) {
        if (cancelled) return
        const msg = err?.response?.data?.detail || 'Erreur de chargement de la video.'
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
    let cleanupVideoEvents = null
    let activePlayer = null

    lastSavedRef.current = 0
    completionReportedRef.current = false
    clearProgressInterval()

    const syncProgress = () => {
      const current = activePlayer?.video?.currentTime ?? 0
      const pct = durationSeconds > 0 ? current / durationSeconds : 0

      onProgressRef.current?.(current, pct)

      if (pct >= 0.9) {
        reportCompletion()
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

        const handlePlay = () => {
          setIsPlaying(true)
        }

        const handlePause = () => {
          setIsPlaying(false)
        }

        const handleEnded = () => {
          reportCompletion()
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

        const msg = err?.message || "Erreur d'initialisation du lecteur video."
        setError(msg)
        toast.error(msg)
      })

    return () => {
      cancelled = true
      cleanupVideoEvents?.()
      clearProgressInterval()
    }
  }, [
    clearProgressInterval,
    durationSeconds,
    reportCompletion,
    saveProgress,
    streamData,
  ])

  useEffect(() => {
    if (!isPlaying) {
      clearProgressInterval()
      return
    }

    const intervalId = setInterval(() => {
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
  }, [clearProgressInterval, isPlaying, saveProgress])

  if (loading) {
    return (
      <div className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Chargement de la video...</span>
        </div>
      </div>
    )
  }

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
              void saveProgress(durationSeconds)
              toast.success('Lecon marquee comme terminee !')
              onCompleteRef.current?.()
            }}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Marquer comme terminee
          </button>
        </div>
      </div>
    )
  }

  const iframeSrc = `https://player.vdocipher.com/v2/?otp=${streamData.otp}&playbackInfo=${streamData.playback_info}&player=&`

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
