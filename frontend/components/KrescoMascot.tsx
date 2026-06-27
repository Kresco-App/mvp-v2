'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

export type MascotMood = 'happy' | 'love' | 'angry' | 'sad' | 'idle'

const MOOD_IMAGES: Record<MascotMood, string> = {
  happy: '/mascot/happy.png',
  love: '/mascot/love.png',
  angry: '/mascot/angry.png',
  sad: '/mascot/sad.png',
  idle: '/mascot/happy.png',
}

const MESSAGES_FR: Record<MascotMood, string[]> = {
  idle: ['Continue comme ca !', 'Pret a apprendre ?', 'Tu geres !'],
  happy: ['Excellent travail !', 'Bravo !', 'Parfait !'],
  love: ['Incroyable !', 'Score parfait !', 'Tu es formidable !'],
  angry: ['Concentre-toi !', 'Tu peux mieux faire !', 'Allez, on recommence !'],
  sad: ['Ne lache pas !', 'Reessaie, tu vas y arriver !', 'Courage !'],
}

interface Props {
  mood?: MascotMood
  message?: string
  size?: number
  floating?: boolean
  onClick?: () => void
}

export default function KrescoMascot({
  mood = 'idle',
  message,
  size = 80,
  floating = true,
  onClick,
}: Props) {
  const [showBubble, setShowBubble] = useState(false)
  const [currentMsg, setCurrentMsg] = useState('')
  const [msgIdx, setMsgIdx] = useState(0)
  const [prevMood, setPrevMood] = useState(mood)
  const [transitioning, setTransitioning] = useState(false)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const msgs = MESSAGES_FR[mood]
    setCurrentMsg(message ?? msgs[msgIdx % msgs.length])
  }, [mood, msgIdx, message])

  // Cycle messages
  useEffect(() => {
    if (message) return
    const t = setInterval(() => setMsgIdx(n => n + 1), 8000)
    return () => clearInterval(t)
  }, [message])

  // Mood transition
  useEffect(() => {
    if (mood !== prevMood) {
      setTransitioning(true)
      const t = setTimeout(() => {
        setPrevMood(mood)
        setTransitioning(false)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [mood, prevMood])

  useEffect(() => {
    const bubbleTimer = bubbleTimerRef.current
    return () => {
      if (bubbleTimer) clearTimeout(bubbleTimer)
    }
  }, [])

  // Show bubble on mood change or message change
  useEffect(() => {
    if (message) {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      setShowBubble(true)
      const hideTimer = setTimeout(() => setShowBubble(false), 5000)
      bubbleTimerRef.current = hideTimer
      return () => {
        clearTimeout(hideTimer)
      }
    }
  }, [message, mood])

  const handleClick = useCallback(() => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    setShowBubble(true)
    bubbleTimerRef.current = setTimeout(() => setShowBubble(false), 4000)
    onClick?.()
  }, [onClick])

  const animationClass = {
    idle: 'mascot-float',
    happy: 'mascot-bounce',
    love: 'mascot-pulse',
    angry: 'mascot-shake',
    sad: 'mascot-droop',
  }[mood]

  return (
    <>
      <div className="relative inline-flex flex-col items-center select-none">
        {/* Speech bubble */}
        {showBubble && (
          <div className="bubble-in absolute bottom-full mb-3 z-[60] max-w-[min(220px,calc(100vw-2rem))] rounded-2xl rounded-bl-sm border border-slate-700 bg-slate-900/95 px-4 py-2.5 text-pretty text-xs font-semibold leading-5 text-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-sm">
            {currentMsg}
            <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-slate-900/95 border-b border-r border-slate-700 rotate-45" />
          </div>
        )}

        {/* Fox mascot */}
        <button
          type="button"
          aria-label="Show Kresco mascot message"
          className={`cursor-pointer rounded-full border-0 bg-transparent p-0 transition-[filter,transform] duration-150 ease-out hover:drop-shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${mascotSizeClass(size)} ${floating ? animationClass : ''}`}
          onClick={handleClick}
        >
          <Image
            src={MOOD_IMAGES[transitioning ? prevMood : mood]}
            alt={`Kresco helper - ${mood}`}
            width={size}
            height={size}
            className={`h-full w-full object-contain drop-shadow-md transition-[opacity] duration-150 ease-out motion-reduce:transition-none ${transitioning ? 'opacity-0' : 'opacity-100'}`}
            draggable={false}
            priority={false}
          />
        </button>
      </div>
    </>
  )
}

function mascotSizeClass(size: number) {
  if (size <= 40) return 'size-10'
  if (size <= 72) return 'size-[72px]'
  return 'size-20'
}

// Global floating companion
export function FloatingMascot() {
  const [mood, setMood] = useState<MascotMood>('happy')
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const eventResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Listen for custom events from quiz/lesson completions
  useEffect(() => {
    function handleMascotEvent(e: CustomEvent) {
      if (eventResetTimerRef.current) clearTimeout(eventResetTimerRef.current)
      setMood(e.detail.mood ?? 'happy')
      setMessage(e.detail.message)
      eventResetTimerRef.current = setTimeout(() => {
        setMessage(undefined)
        setMood('idle') // Reset to idle after event message disappears
      }, 5000)
    }
    window.addEventListener('kresco-mascot' as any, handleMascotEvent as any)
    return () => {
      window.removeEventListener('kresco-mascot' as any, handleMascotEvent as any)
      if (eventResetTimerRef.current) clearTimeout(eventResetTimerRef.current)
    }
  }, [])

  if (!visible) return null

  const helperActionClass = 'min-h-10 w-full rounded-[10px] px-3 py-2 text-left text-xs font-bold leading-5 text-slate-300 transition-[background-color,box-shadow,color,transform] duration-150 ease-out hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/45 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100'

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-10 sm:right-10">
      {/* Expanded helper panel */}
      {expanded && (
        <div className="bubble-in mb-2 w-64 max-w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
          <p className="mb-2 text-sm font-bold text-white">Besoin d&apos;aide ?</p>
          <div className="space-y-2">
            <button type="button"
              onClick={() => { setMessage('Clique sur une matiere pour commencer !'); setMood('happy'); setExpanded(false) }}
              className={helperActionClass}
            >
              Comment commencer ?
            </button>
            <button type="button"
              onClick={() => { setMessage('Regarde la video, puis passe le quiz avec 80% !'); setMood('idle'); setExpanded(false) }}
              className={helperActionClass}
            >
              Comment debloquer une lecon ?
            </button>
            <button type="button"
              onClick={() => { setMessage('Complete des lecons et des quiz pour gagner de l\'XP !'); setMood('love'); setExpanded(false) }}
              className={helperActionClass}
            >
              Comment gagner de l&apos;XP ?
            </button>
          </div>
        </div>
      )}

      <div className="mascot-pop-in">
        <KrescoMascot
          mood={mood}
          message={message}
          size={72}
          floating
          onClick={() => setExpanded(e => !e)}
        />
      </div>
    </div>
  )
}

