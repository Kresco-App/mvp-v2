'use client'

import { useState } from 'react'
import { Play, Pause, RotateCcw, Timer, ChevronDown, Volume2, VolumeX, Flame } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusEngine, PRESETS, FocusPreset } from '@/hooks/useFocusEngine'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Props {
  engine: ReturnType<typeof useFocusEngine>
}

export default function PomodoroTimer({ engine }: Props) {
  const [showPresets, setShowPresets] = useState(false)

  const {
    preset, state, remainingSeconds, progress, streak,
    tabWarnings, isMuted,
    selectPreset, start, pause, resume, reset, toggleMute,
  } = engine

  const presetLabel = preset === 'custom' ? 'Personnalise' : PRESETS[preset].label
  const isActive = state === 'running' || state === 'paused'

  return (
    <div className="flex items-center gap-3">
      {/* Preset selector */}
      <div className="relative">
        <button
          onClick={() => !isActive && setShowPresets(!showPresets)}
          disabled={isActive}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white disabled:cursor-default disabled:hover:text-slate-400 transition px-2 py-1 rounded-lg hover:bg-slate-800"
        >
          <Timer size={13} />
          {presetLabel}
          {!isActive && <ChevronDown size={11} />}
        </button>
        <AnimatePresence>
          {showPresets && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[140px]"
            >
              {(Object.entries(PRESETS) as [FocusPreset, typeof PRESETS.sprint][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => { selectPreset(key as FocusPreset); setShowPresets(false) }}
                  className={`w-full text-left px-3 py-2 text-xs transition ${
                    preset === key ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {val.label} <span className="text-slate-500">({val.minutes}m)</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timer display */}
      <div className="flex items-center gap-2">
        {/* Progress ring */}
        <div className="relative w-8 h-8">
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke="rgb(51,65,85)" strokeWidth="2" />
            <circle
              cx="16" cy="16" r="14" fill="none"
              stroke={state === 'finished' ? '#22c55e' : '#6366f1'}
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 14}`}
              strokeDashoffset={`${2 * Math.PI * 14 * (1 - progress)}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
        </div>

        <span className={`font-mono text-sm font-bold tabular-nums ${
          state === 'finished' ? 'text-green-400' :
          state === 'running' ? 'text-white' : 'text-slate-300'
        }`}>
          {formatTime(remainingSeconds)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {state === 'idle' && (
          <button onClick={start} className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition">
            <Play size={12} className="ml-0.5" />
          </button>
        )}
        {state === 'running' && (
          <button onClick={pause} className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition">
            <Pause size={12} />
          </button>
        )}
        {state === 'paused' && (
          <button onClick={resume} className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition">
            <Play size={12} className="ml-0.5" />
          </button>
        )}
        {(isActive || state === 'finished') && (
          <button onClick={reset} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="flex items-center gap-1 text-orange-400 text-xs font-bold ml-1">
          <Flame size={13} />
          {streak}
        </div>
      )}

      {/* Tab warnings */}
      {tabWarnings > 0 && state !== 'idle' && (
        <span className="text-[10px] text-amber-400/70 font-medium">
          {tabWarnings} distraction{tabWarnings > 1 ? 's' : ''}
        </span>
      )}

      {/* Mute toggle */}
      <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-white transition">
        {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
    </div>
  )
}
