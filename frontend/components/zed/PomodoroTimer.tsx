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
  const muteLabel = isMuted ? 'Activer le son' : 'Couper le son'

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 shadow-inner">
      {/* Preset selector */}
      <div className="relative">
        <button type="button"
          onClick={() => !isActive && setShowPresets(!showPresets)}
          disabled={isActive}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:cursor-default disabled:text-slate-500 disabled:hover:bg-transparent disabled:hover:text-slate-500"
          aria-label="Choisir une duree de concentration"
          aria-expanded={showPresets}
          aria-haspopup="menu"
          title="Choisir une duree de concentration"
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
              className="absolute left-0 top-full z-50 mt-2 min-w-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
              role="menu"
            >
              {(Object.entries(PRESETS) as [FocusPreset, typeof PRESETS.sprint][]).map(([key, val]) => (
                <button type="button"
                  key={key}
                  onClick={() => { selectPreset(key as FocusPreset); setShowPresets(false) }}
                  role="menuitem"
                  className={`w-full text-left px-3 py-2 text-xs transition ${
                    preset === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  {val.label} <span className="text-slate-400">({val.minutes}m)</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timer display */}
      <div className="flex items-center gap-2">
        {/* Progress ring */}
        <div className="relative h-8 w-8">
          <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="none" stroke="rgb(226,232,240)" strokeWidth="2" />
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

        <span aria-label="Temps restant" className={`font-mono text-sm font-bold tabular-nums ${
          state === 'finished' ? 'text-emerald-600' :
          state === 'running' ? 'text-indigo-700' : 'text-slate-700'
        }`}>
          {formatTime(remainingSeconds)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {state === 'idle' && (
          <button type="button" onClick={start} className="rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-700" aria-label="Demarrer le minuteur" title="Demarrer le minuteur">
            <Play size={12} className="ml-0.5" />
          </button>
        )}
        {state === 'running' && (
          <button type="button" onClick={pause} className="rounded-lg bg-slate-900 p-1.5 text-white transition hover:bg-slate-700" aria-label="Mettre le minuteur en pause" title="Mettre le minuteur en pause">
            <Pause size={12} />
          </button>
        )}
        {state === 'paused' && (
          <button type="button" onClick={resume} className="rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-700" aria-label="Reprendre le minuteur" title="Reprendre le minuteur">
            <Play size={12} className="ml-0.5" />
          </button>
        )}
        {(isActive || state === 'finished') && (
          <button type="button" onClick={reset} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label="Reinitialiser le minuteur" title="Reinitialiser le minuteur">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="ml-1 flex items-center gap-1 text-xs font-bold text-orange-600">
          <Flame size={13} />
          {streak}
        </div>
      )}

      {/* Tab warnings */}
      {tabWarnings > 0 && state !== 'idle' && (
        <span className="text-[10px] font-medium text-amber-600">
          {tabWarnings} distraction{tabWarnings > 1 ? 's' : ''}
        </span>
      )}

      {/* Mute toggle */}
      <button type="button" onClick={toggleMute} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label={muteLabel} title={muteLabel}>
        {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
    </div>
  )
}
