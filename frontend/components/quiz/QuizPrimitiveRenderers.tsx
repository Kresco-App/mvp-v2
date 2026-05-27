'use client'

import { useState } from 'react'
import { Reorder } from 'framer-motion'
import { Check, GripVertical, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { Feedback } from './QuizPrimitiveShared'
import {
  availableFormulaTokens,
  circleInsideEllipse,
  isNumericApproximationCorrect,
  isOrderedAnswerCorrect,
  isTextAnswerCorrect,
  isWithinTolerance,
  toggleSelection,
  type QuizPrimitiveQuestion,
} from '@/lib/quizPrimitiveViewModel'

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
            {option.image && (
              <div className="relative h-28 w-full overflow-hidden">
                <Image src={option.image} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" className="object-cover" />
              </div>
            )}
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

  return (
    <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
      {question.options.map((option) => {
        const active = selected.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelected((current) => toggleSelection(current, option.id))}
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
  const correct = isNumericApproximationCorrect(value, question.answer, question.tolerance)

  return (
    <div className="grid gap-4 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      <label className="grid gap-2">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#71717b]">Student answer</span>
        <div className="grid grid-cols-[minmax(0,1fr)_70px] overflow-hidden rounded-[14px] border-2 border-[#e4e4e7] bg-white">
          <input
            aria-label="Student answer"
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
  const correct = attempted && isWithinTolerance(value, question.answer, question.tolerance)

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
          aria-label="Estimate"
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
      </div>
      <button type="button" onClick={() => setAttempted(true)} className="min-h-[46px] rounded-[12px] bg-[#453dee] px-4 text-[13px] font-black text-white">
        Validate estimate
      </button>
      <Feedback neutral={!attempted} correct={correct} text={`Target tolerance: +/- ${question.tolerance} ${question.unit}`} />
    </div>
  )
}

function TextQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'exact_match' | 'fill_in_blank' | 'short_answer' }> }) {
  const [value, setValue] = useState('')
  const attempted = value.trim().length > 0
  const multiline = question.type === 'short_answer'
  const correct = multiline ? attempted : isTextAnswerCorrect(value, question.answer)

  return (
    <div className="grid gap-4 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      {multiline ? (
        <textarea
          aria-label="Student answer"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={question.sample}
          className="min-h-[118px] resize-none rounded-[14px] border-2 border-[#e4e4e7] bg-white px-4 py-3 text-[15px] font-bold leading-6 text-[#3f3f46] outline-none focus:border-[#453dee]"
        />
      ) : (
        <input
          aria-label="Student answer"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={question.sample}
          className="min-h-[58px] rounded-[14px] border-2 border-[#e4e4e7] bg-white px-4 text-[20px] font-black text-[#3f3f46] outline-none focus:border-[#453dee]"
        />
      )}
      <Feedback correct={correct} neutral={!attempted} text={question.hint ?? (multiline ? 'Compare with the correction after answering.' : `Expected: ${question.answer}`)} />
    </div>
  )
}

function FormulaBuilderQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'formula_builder' }> }) {
  const [built, setBuilt] = useState<string[]>([])
  const attempted = built.length >= question.answer.length
  const correct = attempted && isOrderedAnswerCorrect(built, question.answer)
  const available = availableFormulaTokens(question.tokens, built)

  return (
    <div className="grid gap-4">
      <div className="flex min-h-[60px] flex-wrap items-center gap-2 rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb] p-3">
        {built.length === 0 && <span className="text-[13px] font-black text-[#9f9fa9]">Tap tiles to build the expression</span>}
        {built.map((id, index) => (
          <button key={`${id}-${index}`} type="button" onClick={() => setBuilt((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-[10px] bg-[#eef2ff] px-3 py-2 text-[18px] font-black text-[#453dee]">
            {question.tokens.find((item) => item.id === id)?.label ?? id}
          </button>
        ))}
        {built.length > 0 && (
          <button type="button" onClick={() => setBuilt([])} className="ml-auto grid h-10 w-10 place-items-center rounded-[10px] bg-white text-[#71717b]" aria-label="Reset formula">
            <RotateCcw size={17} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 max-[760px]:grid-cols-2">
        {available.map((token) => (
          <button key={token.id} type="button" onClick={() => setBuilt((current) => [...current, token.id])} className="min-h-[52px] rounded-[12px] border-2 border-[#e4e4e7] bg-white px-3 text-[16px] font-black text-[#3f3f46]">
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
      {question.lines.map((line) => (
        <button key={line.id} type="button" onClick={() => setSelected(line.id)} className={`rounded-[12px] border-2 px-4 py-3 text-left text-[14px] font-black ${selected === line.id ? 'border-[#453dee] bg-[#eef2ff]' : 'border-[#e4e4e7] bg-white'}`}>
          {line.label}
        </button>
      ))}
      <Feedback neutral={!attempted} correct={correct} text={attempted ? question.explanation ?? 'Line checked.' : 'Choose the first line where the reasoning breaks.'} />
    </div>
  )
}

function OrderingQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'ordering' }> }) {
  const [items, setItems] = useState(question.items)

  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="m-0 grid list-none gap-2 p-0">
      {items.map((item, index) => (
        <Reorder.Item key={item.id} value={item} className="grid cursor-grab grid-cols-[34px_24px_minmax(0,1fr)] items-center gap-3 rounded-[14px] border border-[#e4e4e7] bg-white px-3 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#f7f8fb] text-[13px] font-black text-[#71717b]">{index + 1}</span>
          <GripVertical size={17} className="text-[#9f9fa9]" />
          <strong className="truncate text-[14px] font-black text-[#3f3f46]">{item.label}</strong>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function MatchingQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'matching' }> }) {
  const [matched, setMatched] = useState<Record<string, string>>({})

  return (
    <div className="grid gap-3">
      {question.left.map((left) => (
        <label key={left.id} className="grid gap-2 rounded-[14px] border border-[#e4e4e7] bg-white p-3">
          <span className="text-[13px] font-black text-[#3f3f46]">{left.label}</span>
          <select aria-label={`Match for ${left.label}`} value={matched[left.id] ?? ''} onChange={(event) => setMatched((current) => ({ ...current, [left.id]: event.target.value }))} className="rounded-[10px] border border-[#e4e4e7] px-3 py-2 text-[13px] font-bold">
            <option value="">Choose match</option>
            {question.right.map((right) => <option key={right.id} value={right.id}>{right.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  )
}

function DragDropQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'drag_and_drop' }> }) {
  const [assignments, setAssignments] = useState<Record<string, string>>({})

  return (
    <div className="grid gap-3">
      {question.items.map((item) => (
        <label key={item.id} className="grid gap-2 rounded-[14px] border border-[#e4e4e7] bg-white p-3">
          <span className="text-[13px] font-black text-[#3f3f46]">{item.label}</span>
          <select aria-label={`Zone for ${item.label}`} value={assignments[item.id] ?? ''} onChange={(event) => setAssignments((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-[10px] border border-[#e4e4e7] px-3 py-2 text-[13px] font-bold">
            <option value="">Choose zone</option>
            {question.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  )
}

function HotspotQuestion({ question }: { question: Extract<QuizPrimitiveQuestion, { type: 'image_hotspot' }> }) {
  const [cursor, setCursor] = useState(question.cursor)
  const correct = circleInsideEllipse(cursor, question.answerRegion)

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[14px] border border-[#e4e4e7] bg-[#f7f8fb]">
        <button
          type="button"
          aria-label="Move hotspot"
          onClick={() => setCursor((current) => ({
            x: question.answerRegion.x,
            y: question.answerRegion.y,
            radius: current.radius,
          }))}
          className="absolute rounded-full border-4 border-[#453dee] bg-[#453dee]/20"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%`, width: `${cursor.radius * 2}%`, height: `${cursor.radius * 2}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <Feedback correct={correct} text={correct ? `Inside ${question.answerRegion.label}` : `Find ${question.answerRegion.label}`} />
    </div>
  )
}
