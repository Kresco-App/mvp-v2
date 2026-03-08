'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Play } from 'lucide-react'
import api from '@/lib/axios'

export default function VideoPlayer({ lessonId, durationSeconds, onProgress, onComplete }) {
  const iframeRef = useRef(null)
  const playerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const [streamData, setStreamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const lastSavedRef = useRef(0)

  useEffect(() => {
    async function fetchStream() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`/courses/sections/${lessonId}/stream`)
        setStreamData(data)
      } catch (err) {
        const msg = err?.response?.data?.detail || 'Erreur de chargement de la video.'
        setError(msg)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }
    fetchStream()

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [lessonId])

  useEffect(() => {
    if (!streamData || !iframeRef.current) return

    // For mock OTP (development), show placeholder
    if (streamData.otp === 'mock-otp-token') return

    // Load VdoCipher player script
    const script = document.createElement('script')
    script.src = 'https://player.vdocipher.com/playerAssets/1.6.10/vdo.js'
    script.onload = () => {
      if (window.VdoPlayer && iframeRef.current) {
        playerRef.current = window.VdoPlayer.getInstance(iframeRef.current)
        playerRef.current.addEventListener('play', () => {
          // Start progress polling every 30s
          progressIntervalRef.current = setInterval(() => {
            const current = playerRef.current?.video?.currentTime ?? 0
            if (current !== lastSavedRef.current) {
              lastSavedRef.current = current
              saveProgress(Math.round(current))
            }
          }, 30000)
        })
        playerRef.current.addEventListener('ended', () => {
          saveProgress(durationSeconds)
          onComplete?.()
        })
        playerRef.current.addEventListener('timeupdate', () => {
          const current = playerRef.current?.video?.currentTime ?? 0
          const pct = durationSeconds > 0 ? current / durationSeconds : 0
          onProgress?.(current, pct)
          // Auto-complete at 90%
          if (pct >= 0.9) {
            onComplete?.()
          }
        })
      }
    }
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamData])

  async function saveProgress(watchedSeconds) {
    try {
      await api.post('/progress/update', {
        lesson_id: lessonId,
        watched_seconds: watchedSeconds,
      })
    } catch {
      // Silent — not critical
    }
  }

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

  // Development mock player
  if (streamData?.otp === 'mock-otp-token') {
    return (
      <div className="aspect-video bg-slate-950 rounded-2xl flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-slate-950" />
        <div className="relative flex flex-col items-center gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-slate-900/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <Play size={28} className="text-white fill-white ml-1" />
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Lecteur video de demo</p>
            <p className="text-slate-400 text-sm">
              Le lecteur VdoCipher apparaitra ici une fois un vrai ID video configure.
            </p>
          </div>
          <button
            onClick={() => {
              saveProgress(durationSeconds)
              toast.success('Lecon marquee comme terminee !')
              onComplete?.()
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
        className="w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  )
}
