'use client'

import { useEffect, useState, useCallback } from 'react'

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

  // Show bubble on mood change or message change
  useEffect(() => {
    if (message) {
      setShowBubble(true)
      const t = setTimeout(() => setShowBubble(false), 5000)
      return () => clearTimeout(t)
    }
  }, [message, mood])

  const handleClick = useCallback(() => {
    setShowBubble(true)
    setTimeout(() => setShowBubble(false), 4000)
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
      <style jsx global>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes mascot-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-10px) scale(1.05); }
          50% { transform: translateY(0) scale(1); }
          75% { transform: translateY(-5px) scale(1.02); }
        }
        @keyframes mascot-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes mascot-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(-3px) rotate(-2deg); }
          40% { transform: translateX(3px) rotate(2deg); }
          60% { transform: translateX(-2px) rotate(-1deg); }
          80% { transform: translateX(2px) rotate(1deg); }
        }
        @keyframes mascot-droop {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(3px) rotate(-2deg); }
        }
        @keyframes mascot-pop-in {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bubble-in {
          0% { transform: scale(0.8) translateY(4px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .mascot-float { animation: mascot-float 3s ease-in-out infinite; }
        .mascot-bounce { animation: mascot-bounce 0.8s ease-in-out infinite; }
        .mascot-pulse { animation: mascot-pulse 1.5s ease-in-out infinite; }
        .mascot-shake { animation: mascot-shake 0.5s ease-in-out infinite; }
        .mascot-droop { animation: mascot-droop 2.5s ease-in-out infinite; }
        .mascot-pop-in { animation: mascot-pop-in 0.4s ease-out forwards; }
        .bubble-in { animation: bubble-in 0.25s ease-out forwards; }
      `}</style>

      <div className="relative inline-flex flex-col items-center select-none">
        {/* Speech bubble */}
        {showBubble && (
          <div className="bubble-in absolute bottom-full mb-3 bg-slate-900/95 backdrop-blur-sm border border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.25)] rounded-2xl rounded-bl-sm px-4 py-2.5 text-xs font-semibold text-slate-200 whitespace-nowrap z-[60] max-w-[220px]">
            {currentMsg}
            <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-slate-900/95 border-b border-r border-slate-700 rotate-45" />
          </div>
        )}

        {/* Fox mascot */}
        <div
          className={`cursor-pointer transition-transform duration-200 hover:scale-110 ${floating ? animationClass : ''}`}
          style={{ width: size, height: size }}
          onClick={handleClick}
        >
          <img
            src={MOOD_IMAGES[transitioning ? prevMood : mood]}
            alt={`Kresco fox - ${mood}`}
            className={`w-full h-full object-contain drop-shadow-md transition-opacity duration-200 ${transitioning ? 'opacity-0' : 'opacity-100'}`}
            draggable={false}
          />
        </div>
      </div>
    </>
  )
}

// Global floating companion
export function FloatingMascot() {
  const [mood, setMood] = useState<MascotMood>('happy')
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Listen for custom events from quiz/lesson completions
  useEffect(() => {
    function handleMascotEvent(e: CustomEvent) {
      setMood(e.detail.mood ?? 'happy')
      setMessage(e.detail.message)
      setTimeout(() => {
        setMessage(undefined)
        setMood('idle') // Reset to idle after event message disappears
      }, 5000)
    }
    window.addEventListener('kresco-mascot' as any, handleMascotEvent as any)
    return () => window.removeEventListener('kresco-mascot' as any, handleMascotEvent as any)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-14 right-14 z-50 flex flex-col items-end gap-2">
      {/* Expanded helper panel */}
      {expanded && (
        <div className="bubble-in bg-slate-900 rounded-2xl shadow-xl border border-slate-700 p-4 w-64 mb-2">
          <p className="font-bold text-white text-sm mb-2">Besoin d&apos;aide ?</p>
          <div className="space-y-2">
            <button
              onClick={() => { setMessage('Clique sur une matiere pour commencer !'); setMood('happy'); setExpanded(false) }}
              className="w-full text-left text-xs text-slate-400 hover:bg-slate-950 px-3 py-2 rounded-lg transition"
            >
              Comment commencer ?
            </button>
            <button
              onClick={() => { setMessage('Regarde la video, puis passe le quiz avec 80% !'); setMood('idle'); setExpanded(false) }}
              className="w-full text-left text-xs text-slate-400 hover:bg-slate-950 px-3 py-2 rounded-lg transition"
            >
              Comment debloquer une lecon ?
            </button>
            <button
              onClick={() => { setMessage('Complete des lecons et des quiz pour gagner de l\'XP !'); setMood('love'); setExpanded(false) }}
              className="w-full text-left text-xs text-slate-400 hover:bg-slate-950 px-3 py-2 rounded-lg transition"
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

// Helper to trigger mascot events from anywhere
export function triggerMascot(mood: MascotMood, message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kresco-mascot', { detail: { mood, message } }))
  }
}
