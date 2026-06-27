'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Item {
  id: string
  label: string
}

interface Props {
  question: string
  items: Item[]
  zones: { id: string; label: string; correctItemId: string }[]
  onComplete?: (correct: boolean) => void
}

const activityControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'
const activityDropZoneMotionClass = 'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function DragAndDrop({ question, items, zones, onComplete }: Props) {
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [dragItem, setDragItem] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(false)

  const assignedItemIds = Object.values(assignments)
  const unassigned = items.filter(i => !assignedItemIds.includes(i.id))

  function assignItemToZone(itemId: string, zoneId: string) {
    const updated = { ...assignments }
    Object.keys(updated).forEach(z => { if (updated[z] === itemId) delete updated[z] })
    updated[zoneId] = itemId
    setAssignments(updated)
    setDragItem(null)
  }

  function unassignZone(zoneId: string) {
    const updated = { ...assignments }
    delete updated[zoneId]
    setAssignments(updated)
  }

  function handleDrop(zoneId: string) {
    if (!dragItem || submitted) return
    assignItemToZone(dragItem, zoneId)
  }

  function handleSubmit() {
    const allCorrect = zones.every(z => assignments[z.id] === z.correctItemId)
    setCorrect(allCorrect)
    setSubmitted(true)
    onComplete?.(allCorrect)
  }

  function handleReset() {
    setAssignments({})
    setSubmitted(false)
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Glisser-deposer</p>
      <p className="text-white text-base">{question}</p>

      {/* Draggable items */}
      <div className="flex flex-wrap gap-3">
        {unassigned.map(item => (
          <button
            key={item.id}
            type="button"
            draggable
            data-kresco-drag-surface="true"
            onDragStart={() => setDragItem(item.id)}
            onClick={() => setDragItem(item.id)}
            aria-pressed={dragItem === item.id}
            className={`kresco-drag-surface cursor-grab select-none rounded-xl border bg-indigo-500/15 px-4 py-2.5 text-left text-sm font-medium text-indigo-300 active:cursor-grabbing ${activityControlMotionClass} hover:bg-indigo-500/25 ${
              dragItem === item.id ? 'border-indigo-300 ring-2 ring-indigo-400/40' : 'border-indigo-500/30'
            }`}
          >
            {item.label}
          </button>
        ))}
        {unassigned.length === 0 && !submitted && (
          <p className="text-sm text-slate-500">Tous les elements sont places</p>
        )}
      </div>

      {/* Drop zones */}
      <div className="grid grid-cols-2 gap-4">
        {zones.map(zone => {
          const assigned = items.find(i => i.id === assignments[zone.id])
          const isCorrect = submitted && assignments[zone.id] === zone.correctItemId
          const isWrong = submitted && assigned && assignments[zone.id] !== zone.correctItemId

          return (
            <button
              key={zone.id}
              type="button"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(zone.id)}
              onClick={() => {
                if (submitted) return
                if (dragItem) {
                  assignItemToZone(dragItem, zone.id)
                } else if (assigned) {
                  unassignZone(zone.id)
                }
              }}
              aria-disabled={submitted || (!dragItem && !assigned)}
              aria-label={
                assigned
                  ? `${zone.label}: ${assigned.label}. Activate to remove.`
                  : dragItem
                    ? `Place selected item in ${zone.label}`
                    : `${zone.label}: empty`
              }
              className={`flex min-h-[80px] flex-col gap-2 rounded-xl border-2 border-dashed p-4 text-left ${activityDropZoneMotionClass} ${
                submitted
                  ? isCorrect ? 'border-green-500/50 bg-green-500/10' : isWrong ? 'border-red-500/50 bg-red-500/10' : 'border-slate-700'
                  : 'border-slate-700 hover:border-indigo-500/40'
              }`}
            >
              <p className="text-xs font-medium text-slate-500">{zone.label}</p>
              {assigned && (
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg self-start ${
                  submitted
                    ? isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                    : 'bg-indigo-500/15 text-indigo-300 cursor-pointer'
                }`}>
                  {assigned.label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {submitted && (
        <div className={`flex items-center gap-2 text-sm font-medium p-4 rounded-xl ${correct ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {correct ? 'Parfait ! Tous les elements sont bien places.' : 'Certains elements sont mal places. Reessayez !'}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button type="button"
            onClick={handleSubmit}
            disabled={Object.keys(assignments).length < zones.length}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 ${activityControlMotionClass}`}
          >
            Verifier
          </button>
        ) : (
          <button type="button"
            onClick={handleReset}
            className={`min-h-10 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 ${activityControlMotionClass}`}
          >
            Reessayer
          </button>
        )}
      </div>
    </div>
  )
}
