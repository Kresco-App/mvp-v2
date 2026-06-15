'use client'

import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleDot,
  GripVertical,
  MoveRight,
  RotateCcw,
  X,
} from 'lucide-react'
import { motion, Reorder, type PanInfo } from 'framer-motion'
import { Feedback } from './QuizPrimitiveShared'
import type { QuizPrimitiveQuestion, QuizPrimitiveOption as Option } from '@/lib/quizPrimitiveViewModel'

export function QuestionRenderer({ question }: { question: QuizPrimitiveQuestion }) {
  switch (question.type) {
    case 'multiple_choice':
    case 'true_false':
      return <ChoiceQuestion question={question} />
    case 'multi_select':
      return <MultiSelectQuestion question={question} />
    case 'numeric_approximation':
      return <NumericQuestion question={question} />
    case 'slider_estimation':
      return <SliderQuestion question={question} />
    case 'exact_match':
    case 'fill_in_blank':
    case 'short_answer':
      return <TextQuestion question={question} />
    case 'ordering':
      return <OrderingQuestion question={question} />
    case 'matching':
      return <MatchingQuestion question={question} />
    case 'formula_builder':
      return <FormulaBuilderQuestion question={question} />
    case 'error_spotting':
      return <ErrorSpottingQuestion question={question} />
    case 'drag_and_drop':
      return <DragDropQuestion question={question} />
    case 'image_hotspot':
      return <HotspotQuestion question={question} />
    default:
      return null
  }
}

function ChoiceQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'multiple_choice' | 'true_false' }> }) {
  const [selected, setSelected] = useState('')

  return (
    <div className={question.options.some((option) => option.image) ? 'grid grid-cols-3 gap-3 max-[760px]:grid-cols-1' : 'grid gap-3'}>
      {question.options.map((option) => {
        const active = selected === option.id
        const correct = option.id === question.answer
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelected(option.id)}
            className={`overflow-hidden rounded-[14px] border-2 text-left transition ${
              active ? 'border-[#453dee] bg-[#eef2ff]' : 'border-[#e4e4e7] bg-white hover:border-[#b9bcff]'
            }`}
          >
            {option.image && <img src={option.image} alt="" className="h-28 w-full object-cover" />}
            <span className="flex min-h-[54px] items-center justify-between gap-3 px-4 py-3">
              <strong className="text-[13px] font-black text-[#3f3f46]">{option.label}</strong>
              {active && (correct ? <Check size={18} className="text-[#16a34a]" /> : <X size={18} className="text-[#dc2626]" />)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MultiSelectQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'multi_select' }> }) {
  const [selected, setSelected] = useState<string[]>([])

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
      {question.options.map((option) => {
        const active = selected.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            className={`flex min-h-[64px] items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-3 text-left transition ${
              active ? 'border-[#453dee] bg-[#eef2ff]' : 'border-[#e4e4e7] bg-white hover:border-[#b9bcff]'
            }`}
          >
            <span className="text-[14px] font-black text-[#3f3f46]">{option.label}</span>
            <span className={`grid h-6 w-6 place-items-center rounded-[8px] border-2 ${active ? 'border-[#453dee] bg-[#453dee] text-white' : 'border-[#d4d4d8] bg-white text-transparent'}`}>
              <Check size={15} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function NumericQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'numeric_approximation' }> }) {
  const [value, setValue] = useState('')
  const attempted = value.trim().length > 0
  const numeric = Number(value)
  const delta = Number.isFinite(numeric) ? Math.abs(numeric - question.answer) : Infinity
  const correct = attempted && delta <= question.tolerance

  return (
    <div className="grid gap-4 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      <label className="grid gap-2">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#71717b]">Student answer</span>
        <div className="grid grid-cols-[minmax(0,1fr)_70px] overflow-hidden rounded-[14px] border-2 border-[#e4e4e7] bg-white">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            placeholder={question.sample}
            className="min-h-[58px] border-0 bg-transparent px-4 text-[24px] font-black text-[#3f3f46] outline-none"
          />
          <span className="grid place-items-center border-l-2 border-[#e4e4e7] text-[16px] font-black text-[#71717b]">{question.unit}</span>
        </div>
      </label>
      <Feedback correct={correct} neutral={!attempted} text={`Accepted tolerance: +/- ${question.tolerance} ${question.unit}`} />
    </div>
  )
}

function SliderQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'slider_estimation' }> }) {
  const [value, setValue] = useState(question.start)
  const [attempted, setAttempted] = useState(false)
  const delta = Math.abs(value - question.answer)
  const correct = attempted && delta <= question.tolerance

  return (
    <div className="grid gap-4 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      <div className="grid gap-3 rounded-[14px] bg-white p-4 ring-1 ring-[#e4e4e7]">
        <div className="flex items-end justify-between gap-3">
          <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#71717b]">Estimate</span>
          <strong className="text-[30px] font-black leading-none text-[#453dee]">
            {value.toFixed(1)} {question.unit}
          </strong>
        </div>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          onPointerUp={() => setAttempted(true)}
          onKeyUp={() => setAttempted(true)}
          className="h-3 w-full accent-[#453dee]"
        />
        <div className="flex justify-between text-[11px] font-black text-[#9f9fa9]">
          <span>{question.min} {question.unit}</span>
          <span>{question.max} {question.unit}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setAttempted(true)}
        className="min-h-[46px] rounded-[12px] bg-[#453dee] px-4 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(58,47,211,0.18)] transition hover:-translate-y-0.5"
      >
        Validate estimate
      </button>
      <Feedback neutral={!attempted} correct={correct} text={`Target tolerance: +/- ${question.tolerance} ${question.unit}`} />
    </div>
  )
}

function TextQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'exact_match' | 'fill_in_blank' | 'short_answer' }> }) {
  const [value, setValue] = useState('')
  const attempted = value.trim().length > 0
  const correct = value.trim().toLowerCase() === question.answer.trim().toLowerCase()
  const multiline = question.type === 'short_answer'

  return (
    <div className="grid gap-4 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={question.sample}
          className="min-h-[118px] resize-none rounded-[14px] border-2 border-[#e4e4e7] bg-white px-4 py-3 text-[15px] font-bold leading-6 text-[#3f3f46] outline-none focus:border-[#453dee]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={question.sample}
          className="min-h-[58px] rounded-[14px] border-2 border-[#e4e4e7] bg-white px-4 text-[20px] font-black text-[#3f3f46] outline-none focus:border-[#453dee]"
        />
      )}
      <Feedback
        correct={correct || (multiline && attempted)}
        neutral={!attempted}
        text={question.hint ?? (multiline ? 'Compare with the correction after answering.' : `Expected: ${question.answer}`)}
      />
    </div>
  )
}

function FormulaBuilderQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'formula_builder' }> }) {
  const [built, setBuilt] = useState<string[]>([])
  const attempted = built.length >= question.answer.length
  const correct = attempted && built.join('|') === question.answer.join('|')
  const available = question.tokens.filter((token) => !built.includes(token.id))

  function addToken(id: string) {
    setBuilt((current) => current.length >= question.answer.length ? current : [...current, id])
  }

  return (
    <div className="grid gap-4">
      <div className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_44px] items-center gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-3">
        <div className="flex min-h-[54px] flex-wrap items-center gap-2 rounded-[12px] bg-white p-2 ring-1 ring-[#e4e4e7]">
          {built.length === 0 && <span className="px-2 text-[13px] font-black text-[#9f9fa9]">Tap tiles to build the expression</span>}
          {built.map((id, index) => {
            const token = question.tokens.find((item) => item.id === id)
            return (
              <motion.button
                key={`${id}-${index}`}
                type="button"
                layout
                onClick={() => setBuilt((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-[10px] bg-[#eef2ff] px-3 py-2 text-[18px] font-black text-[#453dee] ring-1 ring-[#cfd3ff]"
              >
                {token?.label ?? id}
              </motion.button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setBuilt([])}
          className="grid h-11 w-11 place-items-center rounded-[12px] bg-white text-[#71717b] ring-1 ring-[#e4e4e7] transition hover:text-[#453dee]"
          aria-label="Reset formula"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 max-[760px]:grid-cols-2">
        {available.map((token) => (
          <button
            key={token.id}
            type="button"
            onClick={() => addToken(token.id)}
            className="min-h-[52px] rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-[16px] font-black text-[#3f3f46] transition hover:-translate-y-0.5 hover:border-[#453dee] hover:bg-[#eef2ff] hover:text-[#453dee]"
          >
            {token.label}
          </button>
        ))}
      </div>
      <Feedback neutral={!attempted} correct={correct} text={attempted ? 'Expression checked.' : 'Build all required slots, then it checks automatically.'} />
    </div>
  )
}

function ErrorSpottingQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'error_spotting' }> }) {
  const [selected, setSelected] = useState('')
  const attempted = selected.length > 0
  const correct = selected === question.answer

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-3">
        {question.lines.map((line) => {
          const active = selected === line.id
          return (
            <button
              key={line.id}
              type="button"
              onClick={() => setSelected(line.id)}
              className={`rounded-[12px] border-2 px-4 py-3 text-left text-[14px] font-black transition ${
                active
                  ? correct
                    ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
                    : 'border-[#facc15] bg-[#fff7df] text-[#9a5c00] shadow-[0_0_0_4px_rgba(250,204,21,0.14)]'
                  : 'border-white bg-white text-[#3f3f46] hover:border-[#cfd3ff]'
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{line.label}</span>
                {active && (correct ? <Check size={17} /> : <X size={17} />)}
              </span>
            </button>
          )
        })}
      </div>
      <Feedback neutral={!attempted} correct={correct} text={attempted ? question.explanation ?? 'Line checked.' : 'Choose the first line where the reasoning breaks.'} />
    </div>
  )
}

function OrderingQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'ordering' }> }) {
  const [items, setItems] = useState(question.items)

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={setItems}
      className="m-0 grid list-none gap-2 p-0"
    >
      {items.map((item, index) => (
        <Reorder.Item
          key={item.id}
          value={item}
          layout
          whileDrag={{
            scale: 1.025,
            boxShadow: '0 18px 38px rgba(24, 24, 27, 0.16)',
            zIndex: 20,
          }}
          transition={{ type: 'spring', stiffness: 520, damping: 36 }}
          className="grid cursor-grab grid-cols-[34px_24px_minmax(0,1fr)] items-center gap-3 rounded-[14px] border border-[#e4e4e7] bg-white px-3 py-3 active:cursor-grabbing"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#f7f8fb] text-[13px] font-black text-[#71717b]">{index + 1}</span>
          <GripVertical size={17} className="text-[#9f9fa9]" />
          <strong className="truncate text-[14px] font-black text-[#3f3f46]">{item.label}</strong>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function MatchingQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'matching' }> }) {
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; id: string } | null>(null)
  const [matched, setMatched] = useState<Record<string, string>>({})
  const [lastMatched, setLastMatched] = useState<string[]>([])
  const [wrongIds, setWrongIds] = useState<string[]>([])
  const matchedCount = Object.keys(matched).length
  const selectedLabel = selected
    ? [...question.left, ...question.right].find((item) => item.id === selected.id)?.label
    : null

  function isMatched(id: string) {
    return Object.keys(matched).includes(id) || Object.values(matched).includes(id)
  }

  function isSelected(side: 'left' | 'right', id: string) {
    return selected?.side === side && selected.id === id
  }

  function choose(side: 'left' | 'right', id: string) {
    if (isMatched(id)) return
    if (!selected) {
      setSelected({ side, id })
      return
    }
    if (selected.side === side) {
      setSelected({ side, id })
      return
    }

    const leftId = side === 'left' ? id : selected.id
    const rightId = side === 'right' ? id : selected.id
    if (question.answer[leftId] === rightId) {
      setMatched((current) => ({ ...current, [leftId]: rightId }))
      setLastMatched([leftId, rightId])
    } else {
      setWrongIds([leftId, rightId])
      window.setTimeout(() => setWrongIds([]), 520)
    }
    setSelected(null)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[12px] font-black uppercase tracking-[0.1em] text-[#71717b]">Matching flow</p>
            <p className="m-0 mt-1 text-[14px] font-black text-[#3f3f46]">
              {selectedLabel ? `Now choose a match for ${selectedLabel}` : 'Pick a term from either side'}
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[#453dee] ring-1 ring-[#e4e4e7]">
            {matchedCount}/{question.left.length} paired
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <motion.span
            className="block h-full rounded-full bg-[#453dee]"
            animate={{ width: `${(matchedCount / question.left.length) * 100}%` }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-3 max-[760px]:grid-cols-1">
        <div className="grid content-start gap-2">
          <ColumnHeader label="Terms" />
          {question.left.map((left) => (
            <MatchingTile
              key={left.id}
              pairNumber={question.left.findIndex((item) => item.id === left.id) + 1}
              label={left.label}
              matched={isMatched(left.id)}
              selected={isSelected('left', left.id)}
              wrong={wrongIds.includes(left.id)}
              recent={lastMatched.includes(left.id)}
              onClick={() => choose('left', left.id)}
            />
          ))}
        </div>
        <div className="relative grid place-items-center max-[760px]:hidden" aria-hidden="true">
          <div className="absolute inset-y-10 w-px bg-[#e4e4e7]" />
          <motion.div
            animate={selected ? { scale: [1, 1.12, 1], opacity: 1 } : { scale: 1, opacity: 0.38 }}
            transition={{ duration: 0.35 }}
            className="relative z-[1] grid h-10 w-10 place-items-center rounded-full border-2 border-[#e4e4e7] bg-white text-[#453dee] shadow-[0_8px_22px_rgba(24,24,27,0.08)]"
          >
            <MoveRight size={19} strokeWidth={2.7} />
          </motion.div>
        </div>
        <div className="grid content-start gap-2">
          <ColumnHeader label="Matches" />
          {question.right.map((right) => (
            <MatchingTile
              key={right.id}
              pairNumber={question.left.findIndex((left) => question.answer[left.id] === right.id) + 1}
              label={right.label}
              matched={isMatched(right.id)}
              selected={isSelected('right', right.id)}
              wrong={wrongIds.includes(right.id)}
              recent={lastMatched.includes(right.id)}
              onClick={() => choose('right', right.id)}
            />
          ))}
        </div>
      </div>
      <div className="rounded-[12px] bg-[#fff7df] px-4 py-3 text-[13px] font-black text-[#9a5c00]">
        Click one term, then its matching unit. Correct pairs stay visible but muted.
      </div>
    </div>
  )
}

function ColumnHeader({ label }: { label: string }) {
  return (
    <div className="mb-1 flex items-center justify-between px-1">
      <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">{label}</span>
      <span className="h-px flex-1 bg-[#e4e4e7] ml-3" />
    </div>
  )
}

function MatchingTile({
  pairNumber,
  label,
  matched,
  selected,
  wrong,
  recent,
  onClick,
}: {
  pairNumber: number
  label: string
  matched: boolean
  selected: boolean
  wrong: boolean
  recent: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={matched}
      animate={wrong ? { x: [0, -6, 6, -3, 3, 0], scale: [1, 1.015, 1] } : recent && matched ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      className={`min-h-[58px] rounded-[14px] border-2 px-4 text-left text-[16px] font-black transition ${
        matched
          ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d] opacity-60'
          : wrong
            ? 'border-[#facc15] bg-[#fff7df] text-[#9a5c00] shadow-[0_0_0_4px_rgba(250,204,21,0.16)]'
          : selected
            ? 'border-[#453dee] bg-[#eef2ff] text-[#453dee] shadow-[0_0_0_4px_rgba(69,61,238,0.10),0_12px_26px_rgba(58,47,211,0.14)]'
            : 'border-[#e4e4e7] bg-white text-[#3f3f46] hover:border-[#b9bcff] hover:bg-[#fafbff] hover:shadow-[0_8px_20px_rgba(24,24,27,0.07)]'
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`grid h-7 w-7 flex-none place-items-center rounded-[9px] text-[12px] ${
            matched ? 'bg-[#dcfce7] text-[#15803d]' : wrong ? 'bg-[#facc15] text-[#713f12]' : selected ? 'bg-[#453dee] text-white' : 'bg-[#f7f8fb] text-[#71717b]'
          }`}>
            {pairNumber}
          </span>
          <span className="truncate">{label}</span>
        </span>
        {matched ? <Check size={17} /> : wrong ? <X size={17} /> : selected ? <CircleDot size={17} /> : null}
      </span>
    </motion.button>
  )
}

function DragDropQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'drag_and_drop' }> }) {
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [zoneOrders, setZoneOrders] = useState<Record<string, string[]>>({})
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [activeZone, setActiveZone] = useState<string | null>(null)
  const [activeInsertIndex, setActiveInsertIndex] = useState<number | null>(null)
  const poolRef = useRef<HTMLDivElement | null>(null)
  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tokenRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const unassignedItems = question.items.filter((item) => !assignments[item.id])
  const draggedItem = question.items.find((item) => item.id === draggedId)

  function pointInside(element: HTMLDivElement | null, point: { x: number; y: number }) {
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  }

  function zoneAtPoint(point: { x: number; y: number }) {
    if (pointInside(poolRef.current, point)) return 'pool'
    return question.zones.find((zone) => pointInside(zoneRefs.current[zone.id], point))?.id ?? null
  }

  function eventPoint(event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if ('clientX' in event && 'clientY' in event) {
      return { x: event.clientX, y: event.clientY }
    }
    const touch = 'changedTouches' in event ? event.changedTouches[0] : null
    if (touch) return { x: touch.clientX, y: touch.clientY }
    return { x: info.point.x - window.scrollX, y: info.point.y - window.scrollY }
  }

  function orderedZoneItems(zoneId: string) {
    const orderedIds = zoneOrders[zoneId] ?? []
    const assignedIds = question.items.filter((item) => assignments[item.id] === zoneId).map((item) => item.id)
    const ids = [...orderedIds.filter((id) => assignedIds.includes(id)), ...assignedIds.filter((id) => !orderedIds.includes(id))]
    return ids.map((id) => question.items.find((item) => item.id === id)).filter((item): item is Option => Boolean(item))
  }

  function insertionIndexForZone(zoneId: string, point: { x: number; y: number }) {
    const items = orderedZoneItems(zoneId).filter((item) => item.id !== draggedId)
    const index = items.findIndex((item) => {
      const element = tokenRefs.current[item.id]
      if (!element) return false
      const rect = element.getBoundingClientRect()
      return point.y < rect.top + rect.height / 2
    })
    return index === -1 ? items.length : index
  }

  function assign(itemId: string, zoneId: string, insertIndex?: number) {
    setAssignments((current) => ({ ...current, [itemId]: zoneId }))
    setZoneOrders((current) => {
      const next = Object.fromEntries(
        Object.entries(current).map(([key, ids]) => [key, ids.filter((id) => id !== itemId)])
      ) as Record<string, string[]>
      const target = [...(next[zoneId] ?? orderedZoneItems(zoneId).map((item) => item.id)).filter((id) => id !== itemId)]
      const index = Math.max(0, Math.min(insertIndex ?? target.length, target.length))
      target.splice(index, 0, itemId)
      next[zoneId] = target
      return next
    })
  }

  function unassign(itemId: string) {
    setAssignments((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
    setZoneOrders((current) => (
      Object.fromEntries(
        Object.entries(current).map(([key, ids]) => [key, ids.filter((id) => id !== itemId)])
      ) as Record<string, string[]>
    ))
  }

  function handleDragStart(itemId: string) {
    setDraggedId(itemId)
  }

  function handleTokenDrag(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const point = eventPoint(_event, info)
    const zone = zoneAtPoint(point)
    setActiveZone(zone)
    setActiveInsertIndex(zone && zone !== 'pool' ? insertionIndexForZone(zone, point) : null)
  }

  function handleTokenDragEnd(itemId: string, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const point = eventPoint(event, info)
    const targetZone = zoneAtPoint(point) ?? activeZone
    if (targetZone === 'pool') unassign(itemId)
    else if (targetZone) assign(itemId, targetZone, insertionIndexForZone(targetZone, point))
    setDraggedId(null)
    setActiveZone(null)
    setActiveInsertIndex(null)
  }

  return (
    <div className="grid gap-4">
      <div className={`rounded-[14px] px-4 py-3 text-[13px] font-black transition ${
        draggedItem ? 'bg-[#eef2ff] text-[#453dee]' : 'bg-[#f7f8fb] text-[#71717b]'
      }`}>
        {draggedItem ? `Dragging ${draggedItem.label}. Drop it into a highlighted family.` : 'Grab a token and drop it into the right family.'}
      </div>

      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 max-[760px]:grid-cols-1">
      <div
        ref={poolRef}
        className={`relative grid min-h-[210px] content-start gap-2 rounded-[16px] border-2 border-dashed p-3 transition ${
          activeZone === 'pool'
            ? 'z-10 border-[#453dee] bg-[#eef2ff] shadow-[0_10px_24px_rgba(58,47,211,0.08)]'
            : 'border-[#e4e4e7] bg-[#f7f8fb]'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <strong className="block text-[13px] font-black text-[#71717b]">Token tray</strong>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Home</span>
        </div>
        {unassignedItems.length === 0 && (
          <span className="rounded-[12px] bg-white px-3 py-4 text-center text-[12px] font-black text-[#9f9fa9]">
            All sorted
          </span>
        )}
        {unassignedItems.map((item) => (
          <DragToken
            key={item.id}
            item={item}
            dragging={draggedId === item.id}
            onDragStart={() => handleDragStart(item.id)}
            onDrag={handleTokenDrag}
            onDragEnd={(event, info) => handleTokenDragEnd(item.id, event, info)}
            setTokenRef={(node) => {
              tokenRefs.current[item.id] = node
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
        {question.zones.map((zone) => (
          <div
            key={zone.id}
            ref={(node) => {
              zoneRefs.current[zone.id] = node
            }}
            className={`relative min-h-[210px] overflow-visible rounded-[16px] border-2 border-dashed p-3 transition ${
              activeZone === zone.id
                ? 'z-10 border-[#453dee] bg-[#eef2ff] shadow-[0_12px_28px_rgba(58,47,211,0.10)]'
                : 'border-[#cfd3ff] bg-[#f7f8fb]'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <strong className="block text-[13px] font-black text-[#453dee]">{zone.label}</strong>
            </div>
            <div className="mt-3 grid gap-2">
              {orderedZoneItems(zone.id).map((item, index) => (
                <div key={item.id} className="grid gap-2">
                  {activeZone === zone.id && activeInsertIndex === index && item.id !== draggedId && <DropSlot />}
                  <DragToken
                    item={item}
                    assigned
                    correct={question.answer[item.id] === zone.id}
                    dragging={draggedId === item.id}
                    onDragStart={() => handleDragStart(item.id)}
                    onDrag={handleTokenDrag}
                    onDragEnd={(event, info) => handleTokenDragEnd(item.id, event, info)}
                    setTokenRef={(node) => {
                      tokenRefs.current[item.id] = node
                    }}
                  />
                </div>
              ))}
              {activeZone === zone.id && activeInsertIndex === orderedZoneItems(zone.id).filter((item) => item.id !== draggedId).length && <DropSlot />}
              {orderedZoneItems(zone.id).length === 0 && activeZone !== zone.id && (
                <span className={`rounded-[12px] px-3 py-8 text-center text-[12px] font-black transition ${
                  activeZone === zone.id
                    ? 'bg-white text-[#453dee]'
                    : 'bg-white text-[#9f9fa9]'
                }`}>
                  {activeZone === zone.id ? 'Release to place' : 'Drop here'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

function DragToken({
  item,
  assigned = false,
  correct = false,
  dragging,
  onDragStart,
  onDrag,
  onDragEnd,
  setTokenRef,
}: {
  item: Option
  assigned?: boolean
  correct?: boolean
  dragging: boolean
  onDragStart: () => void
  onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  onDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  setTokenRef: (node: HTMLButtonElement | null) => void
}) {
  return (
    <motion.button
      ref={setTokenRef}
      type="button"
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.08}
      layout
      onDragStart={() => {
        onDragStart()
      }}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      whileHover={{ y: -2, boxShadow: '0 10px 24px rgba(24, 24, 27, 0.10)' }}
      whileTap={{ scale: 0.985 }}
      animate={{
        scale: dragging ? 1.035 : 1,
        rotate: dragging ? -0.7 : 0,
        opacity: 1,
        boxShadow: dragging
          ? '0 24px 46px rgba(24, 24, 27, 0.24), 0 0 0 3px rgba(69, 61, 238, 0.10)'
          : assigned
            ? '0 6px 16px rgba(24, 24, 27, 0.06)'
            : '0 4px 12px rgba(24, 24, 27, 0.04)',
      }}
      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      className={`relative ${dragging ? 'z-30' : 'z-[1]'} flex min-h-[44px] cursor-grab select-none items-center gap-2 rounded-[12px] border px-3 py-2 text-left text-[12px] font-black active:cursor-grabbing ${
        assigned
          ? correct
            ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
            : 'border-[#fed7aa] bg-[#fff7df] text-[#b76b00]'
          : 'border-[#e4e4e7] bg-white text-[#3f3f46] shadow-[0_4px_12px_rgba(24,24,27,0.04)]'
      }`}
    >
      <span className={`grid h-6 w-6 flex-none place-items-center rounded-[8px] ${dragging ? 'bg-[#453dee] text-white' : assigned ? 'bg-white/70' : 'bg-[#f7f8fb] text-[#9f9fa9]'}`}>
        <GripVertical size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {assigned && (correct ? <Check size={15} /> : <X size={15} />)}
    </motion.button>
  )
}

function DropSlot() {
  return (
    <motion.div
      layout
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 44, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      className="rounded-[12px] bg-white/80 shadow-[inset_0_0_0_2px_rgba(69,61,238,0.22)]"
    />
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function circleInsideEllipse(
  cursor: { x: number; y: number; radius: number },
  region: Extract<QuizPrimitiveQuestion, { type: 'image_hotspot' }>['answerRegion']
) {
  const safeRx = region.rx - cursor.radius
  const safeRy = region.ry - cursor.radius
  if (safeRx <= 0 || safeRy <= 0) return false
  const dx = cursor.x - region.x
  const dy = cursor.y - region.y
  return ((dx * dx) / (safeRx * safeRx)) + ((dy * dy) / (safeRy * safeRy)) <= 1
}

function HotspotQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'image_hotspot' }> }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [cursor, setCursor] = useState(question.cursor)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const updateStageSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    updateStageSize()

    if (typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(updateStageSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  function pointFromClient(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return cursor
    return {
      ...cursor,
      x: clamp(((clientX - rect.left) / rect.width) * 100, cursor.radius, 100 - cursor.radius),
      y: clamp(((clientY - rect.top) / rect.height) * 100, cursor.radius, 100 - cursor.radius),
    }
  }

  function moveCursor(event: ReactPointerEvent<HTMLElement>) {
    setCursor(pointFromClient(event.clientX, event.clientY))
    setStatus('idle')
  }

  function validate() {
    setStatus(circleInsideEllipse(cursor, question.answerRegion) ? 'correct' : 'wrong')
  }

  function nudge(event: KeyboardEvent<HTMLButtonElement>) {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const step = event.shiftKey ? 4 : 1
    setCursor((current) => ({
      ...current,
      x: clamp(current.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), current.radius, 100 - current.radius),
      y: clamp(current.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), current.radius, 100 - current.radius),
    }))
    setStatus('idle')
  }

  const cursorRadiusY = stageSize.height > 0 ? cursor.radius * (stageSize.width / stageSize.height) : cursor.radius
  const cursorStroke = status === 'correct' ? '#16a34a' : status === 'wrong' ? '#facc15' : '#453dee'
  const cursorTextStroke = status === 'correct' ? '#15803d' : status === 'wrong' ? '#9a5c00' : '#453dee'
  const targetStroke = status === 'correct' ? '#16a34a' : '#facc15'
  const targetFill = status === 'correct' ? '#dcfce7' : '#fff7df'

  return (
    <div className="grid gap-4">
      <div
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) moveCursor(event)
        }}
        className="relative h-[330px] touch-none overflow-hidden rounded-[14px] border-2 border-[#e4e4e7] bg-[#f7f8fb]"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="quizWaveBg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#eef2ff" />
              <stop offset="55%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f0fdf4" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#quizWaveBg)" />
          <path d="M 0 72 C 12 18, 22 18, 34 72 S 56 126, 68 72 S 90 18, 100 72" fill="none" stroke="#453dee" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M 0 72 C 12 18, 22 18, 34 72 S 56 126, 68 72 S 90 18, 100 72" fill="none" stroke="#b9bcff" strokeWidth="8" strokeLinecap="round" opacity="0.18" />
          <line x1="8" y1="72" x2="94" y2="72" stroke="#d4d4d8" strokeWidth="0.8" strokeDasharray="2 2" />
          <line x1="8" y1="14" x2="8" y2="88" stroke="#d4d4d8" strokeWidth="0.8" />
          <text x="10" y="17" fill="#71717b" fontSize="4" fontWeight="800">elongation</text>
          <text x="82" y="79" fill="#71717b" fontSize="4" fontWeight="800">distance</text>
        </svg>

        {status !== 'idle' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <ellipse
              cx={question.answerRegion.x}
              cy={question.answerRegion.y}
              rx={question.answerRegion.rx}
              ry={question.answerRegion.ry}
              fill={targetFill}
              fillOpacity={status === 'correct' ? '0.45' : '0.55'}
              stroke={targetStroke}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        <button
          type="button"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
            moveCursor(event)
          }}
          onPointerMove={(event) => {
            if (dragging) moveCursor(event)
          }}
          onPointerUp={(event) => {
            setDragging(false)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={nudge}
          onDoubleClick={validate}
          className={`absolute inset-0 z-10 h-full w-full border-0 bg-transparent p-0 outline-none focus-visible:ring-4 focus-visible:ring-[#cfd3ff] ${
            dragging ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
          }`}
          aria-label="Move answer circle"
          title="Drag the circle or use arrow keys"
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
            {status !== 'idle' && (
              <ellipse
                cx={cursor.x}
                cy={cursor.y}
                rx={cursor.radius + 1.2}
                ry={cursorRadiusY + 1.2}
                fill="none"
                stroke={status === 'correct' ? '#dcfce7' : '#fff7df'}
                strokeWidth="4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <ellipse
              cx={cursor.x}
              cy={cursor.y}
              rx={cursor.radius}
              ry={cursorRadiusY}
              fill="#ffffff"
              fillOpacity="0.9"
              stroke={cursorStroke}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className={dragging ? 'drop-shadow-[0_20px_46px_rgba(24,24,27,0.24)]' : 'drop-shadow-[0_10px_24px_rgba(69,61,238,0.18)]'}
            />
            <line
              x1={cursor.x - 2.2}
              y1={cursor.y}
              x2={cursor.x + 2.2}
              y2={cursor.y}
              stroke={cursorTextStroke}
              strokeWidth="1.3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={cursor.x}
              y1={cursor.y - Math.min(cursorRadiusY * 0.42, 2.2)}
              x2={cursor.x}
              y2={cursor.y + Math.min(cursorRadiusY * 0.42, 2.2)}
              stroke={cursorTextStroke}
              strokeWidth="1.3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3 max-[760px]:grid-cols-1">
        <div className="rounded-[12px] bg-[#f7f8fb] px-4 py-3 text-[13px] font-black text-[#71717b]" aria-live="polite">
          x {cursor.x.toFixed(0)}%, y {cursor.y.toFixed(0)}%. Drag the circle, click the diagram, or use arrow keys.
        </div>
        <button
          type="button"
          onClick={validate}
          className="min-h-[46px] rounded-[12px] bg-[#453dee] px-4 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(58,47,211,0.18)] transition hover:-translate-y-0.5"
        >
          Validate region
        </button>
      </div>
      <Feedback
        neutral={status === 'idle'}
        correct={status === 'correct'}
        text={status === 'correct' ? 'The full circle fits inside the crest region.' : status === 'wrong' ? 'Close, but the circle is not fully inside the target shape.' : 'Place the circle before validating.'}
      />
    </div>
  )
}
