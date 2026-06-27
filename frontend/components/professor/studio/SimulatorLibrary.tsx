'use client'

import { Component, useMemo, useState, type ReactNode } from 'react'
import { Check, FlaskConical, Search, X } from 'lucide-react'
import { AnimatedContentRenderer } from '@/components/animated/registry'
import {
  SIMULATOR_CATALOG, SIMULATOR_CATEGORIES, defaultConfigFor, findSimulator,
  type SimulatorCategory,
} from '@/lib/simulatorCatalog'

class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: false })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center px-6 text-center text-[13px] font-semibold text-[#a1a1aa]">
          Aperçu indisponible pour ce simulateur. Il fonctionnera dans le cours.
        </div>
      )
    }
    return this.props.children
  }
}

const ACCENT_DOT_CLASSES: Record<string, string> = {
  '#5b60f9': 'bg-[#5b60f9]',
  '#0ea5e9': 'bg-[#0ea5e9]',
  '#f5900b': 'bg-[#f5900b]',
  '#16a34a': 'bg-[#16a34a]',
  '#db2777': 'bg-[#db2777]',
  '#7c3aed': 'bg-[#7c3aed]',
}

function accentDotClass(accent: string) {
  return ACCENT_DOT_CLASSES[accent] ?? 'bg-[#5b60f9]'
}

const libraryControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20 motion-reduce:transition-none motion-reduce:active:scale-100'
const libraryInputMotionClass = 'transition-[border-color,box-shadow] duration-150 ease-out focus:border-[#5b60f9] focus:ring-4 focus:ring-[#5b60f9]/10 motion-reduce:transition-none'

export default function SimulatorLibrary({
  open,
  currentKey,
  onSelect,
  onClose,
}: {
  open: boolean
  currentKey: string
  onSelect: (key: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SimulatorCategory | 'Tous'>('Tous')
  const [focused, setFocused] = useState<string>(currentKey || SIMULATOR_CATALOG[0]?.key || '')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SIMULATOR_CATALOG.filter((s) => {
      if (category !== 'Tous' && s.category !== category) return false
      if (!q) return true
      return s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.key.includes(q)
    })
  }, [query, category])

  const focusedSim = findSimulator(focused)

  function selectSimulator(key: string) {
    onSelect(key)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#18181b]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[20px] border-[2px] border-[#e4e4e7] bg-white shadow-[0_30px_80px_rgba(24,24,27,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
            {/* Header */}
            <div className="flex items-center gap-3 border-b-[2px] border-[#e4e4e7] px-5 py-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#5b60f9] text-white">
                <FlaskConical size={18} />
              </div>
              <div className="mr-auto">
                <h2 className="text-[16px] font-black text-[#3f3f46]">Bibliothèque de simulateurs</h2>
                <p className="text-[12px] font-semibold text-[#a1a1aa]">{SIMULATOR_CATALOG.length} composants interactifs</p>
              </div>
              <div className="relative hidden sm:block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className={`w-56 rounded-[10px] border-[2px] border-[#e4e4e7] py-2 pl-9 pr-3 text-[13px] font-semibold text-[#3f3f46] outline-none ${libraryInputMotionClass}`}
                />
              </div>
              <button type="button" onClick={onClose} className={`grid h-10 w-10 place-items-center rounded-[10px] text-[#71717b] hover:bg-[#f4f4f5] ${libraryControlMotionClass}`} aria-label="Fermer la bibliotheque de simulateurs">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="relative border-b border-[#f4f4f5] px-5 py-2.5 sm:hidden">
              <Search size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                className={`w-full rounded-[10px] border-[2px] border-[#e4e4e7] py-2 pl-9 pr-3 text-[13px] font-semibold text-[#3f3f46] outline-none ${libraryInputMotionClass}`}
              />
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-1.5 border-b border-[#f4f4f5] px-5 py-2.5">
              {(['Tous', ...SIMULATOR_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                  className={`min-h-10 rounded-[9px] border-[2px] px-2.5 py-1 text-[12px] font-black ${libraryControlMotionClass} ${
                    category === cat ? 'border-transparent bg-[#5b60f9] text-white' : 'border-[#e4e4e7] text-[#52525c] hover:border-[#5b60f9]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Body: grid + preview */}
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_420px]">
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {results.map((sim) => {
                    const isFocused = sim.key === focused
                    const isCurrent = sim.key === currentKey
                    return (
                      <article
                        key={sim.key}
                        className={`rounded-[14px] border-[2px] bg-white px-3.5 py-3 transition-[border-color,box-shadow] duration-150 ease-out ${
                          isFocused ? 'border-[#5b60f9] ring-2 ring-[#5b60f9]/15' : 'border-[#e4e4e7] hover:border-[#c7c7cc]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setFocused(sim.key)}
                          onDoubleClick={() => selectSimulator(sim.key)}
                          aria-pressed={isFocused}
                          className="flex w-full flex-col gap-1 text-left outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentDotClass(sim.accent)}`} />
                            <span className="truncate text-[13.5px] font-black text-[#3f3f46]">{sim.title}</span>
                            {isCurrent && <Check size={14} className="ml-auto shrink-0 text-[#16a34a]" />}
                          </div>
                          <span className="text-[12px] font-semibold leading-snug text-[#a1a1aa]">{sim.description}</span>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="w-fit rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#71717b]">
                            {sim.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => selectSimulator(sim.key)}
                            aria-label={`Choisir ${sim.title}`}
                            className="min-h-10 shrink-0 rounded-[9px] bg-[#5b60f9] px-2.5 py-1 text-[11px] font-black text-white transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#4a4fe0] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20 motion-reduce:transition-none motion-reduce:active:scale-100"
                          >
                            {isCurrent ? 'Actif' : 'Choisir'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                  {results.length === 0 && (
                    <p className="col-span-full py-8 text-center text-[13px] font-semibold text-[#a1a1aa]">Aucun simulateur trouvé.</p>
                  )}
                </div>
              </div>

              {/* Preview pane */}
              <div className="hidden min-h-0 flex-col border-l-[2px] border-[#e4e4e7] bg-[#fbfbfc] md:flex">
                <div className="border-b border-[#f4f4f5] px-4 py-2.5">
                  <p className="text-[11px] font-black uppercase tracking-[0.06em] text-[#5b60f9]">Aperçu</p>
                  <p className="truncate text-[14px] font-black text-[#3f3f46]">{focusedSim?.title ?? '—'}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  {focusedSim ? (
                    <PreviewBoundary resetKey={focused}>
                      <div className="rounded-[12px] bg-white p-1">
                        <AnimatedContentRenderer rendererKey={focused} config={defaultConfigFor(focused)} className="block" />
                      </div>
                    </PreviewBoundary>
                  ) : (
                    <div className="grid h-full place-items-center text-[13px] font-semibold text-[#a1a1aa]">Sélectionnez un simulateur.</div>
                  )}
                </div>
                <div className="border-t border-[#f4f4f5] p-3">
                  <button
                    type="button"
                    disabled={!focusedSim}
                    onClick={() => { if (focusedSim) selectSimulator(focusedSim.key) }}
                    className={`min-h-10 w-full rounded-[12px] bg-[#5b60f9] py-2.5 text-[14px] font-black text-white hover:bg-[#4a4fe0] disabled:bg-[#d4d4d8] disabled:active:scale-100 ${libraryControlMotionClass}`}
                  >
                    Choisir ce simulateur
                  </button>
                </div>
              </div>
            </div>
      </div>
    </div>
  )
}
