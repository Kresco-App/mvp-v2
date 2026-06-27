'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, GripVertical } from 'lucide-react'

interface Props {
  question: string
  items: { id: string; label: string }[]
  correctOrder: string[]
  onComplete?: (correct: boolean) => void
}

const activityControlMotionClass = 'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 motion-reduce:transition-none motion-reduce:active:scale-100'
const activityDragSurfaceMotionClass = 'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none'

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

export default function Ordering({ question, items: initialItems, correctOrder, onComplete }: Props) {
  const [items, setItems] = useState(() => shuffleItems(initialItems))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const isCorrect = items.every((item, i) => item.id === correctOrder[i])

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const newItems = [...items]
    const [moved] = newItems.splice(dragIndex, 1)
    newItems.splice(index, 0, moved)
    setItems(newItems)
    setDragIndex(index)
  }

  function handleSubmit() {
    setSubmitted(true)
    onComplete?.(isCorrect)
  }

  function handleReset() {
    setItems(shuffleItems(initialItems))
    setSubmitted(false)
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-6">
      <p className="font-semibold text-slate-300 text-sm tracking-wide uppercase">Remettez dans le bon ordre :</p>
      <p className="text-white text-base">{question}</p>

      <div className="space-y-3">
        {items.map((item, index) => {
          const correctIdx = correctOrder.indexOf(item.id)
          const isCorrectPos = submitted && index === correctIdx

          return (
            <div
              key={item.id}
              draggable={!submitted}
              data-kresco-drag-surface="true"
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              className={`kresco-drag-surface flex items-center gap-4 rounded-xl border-2 p-4 select-none ${activityDragSurfaceMotionClass} ${
                !submitted ? 'border-slate-700 hover:border-indigo-500/40 cursor-grab active:cursor-grabbing bg-slate-800/50' :
                isCorrectPos ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'
              }`}
            >
              <GripVertical size={16} className="text-slate-500 flex-shrink-0" aria-hidden="true" />
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                submitted ? isCorrectPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'
              }`}>
                {index + 1}
              </span>
              <span className={`text-sm font-medium ${submitted ? isCorrectPos ? 'text-green-300' : 'text-red-300' : 'text-slate-200'}`}>
                {item.label}
              </span>
              {submitted && !isCorrectPos && (
                <span className="ml-auto text-xs text-slate-500">position correcte : #{correctIdx + 1}</span>
              )}
            </div>
          )
        })}
      </div>

      {submitted && (
        <div className={`flex items-center gap-2 text-sm font-medium p-4 rounded-xl ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {isCorrect ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
          {isCorrect ? 'Parfait ! Bon ordre !' : 'Ordre incorrect. Reessayez !'}
        </div>
      )}

      <div className="flex gap-3">
        {!submitted ? (
          <button type="button"
            onClick={handleSubmit}
            className={`min-h-10 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 ${activityControlMotionClass}`}
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
