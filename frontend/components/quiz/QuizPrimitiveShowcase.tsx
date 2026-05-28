'use client'

import { useMemo, useState } from 'react'
import { ListChecks, Plus, Sparkles } from 'lucide-react'
import { quizPrimitiveQuestions } from './quizPrimitiveData'
import { quizPrimitiveTypeIcons } from './QuizPrimitiveIcons'
import { QuizQuestionShell } from './QuizPrimitiveQuestionShell'
import {
  findQuizPrimitiveQuestion,
  quizPrimitiveGroups,
  schemaPreview,
} from '@/lib/quizPrimitiveViewModel'

export function QuizPrimitiveShowcase() {
  const [activeId, setActiveId] = useState(quizPrimitiveQuestions[0].id)
  const activeQuestion = findQuizPrimitiveQuestion(quizPrimitiveQuestions, activeId)
  const groups = useMemo(() => quizPrimitiveGroups, [])

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-8 max-[1180px]:grid-cols-1">
        <section className="overflow-hidden rounded-[18px] border-2 border-[#e4e4e7] bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_260px] max-[900px]:grid-cols-1">
            <div className="p-6">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-[12px] font-black uppercase tracking-[0.08em] text-[#453dee]">
                  Data-driven primitive
                </span>
                <span className="rounded-full bg-[#f7f8fb] px-3 py-1 text-[12px] font-black text-[#71717b]">
                  {activeQuestion.concept}
                </span>
                <span className="rounded-full bg-[#fff7df] px-3 py-1 text-[12px] font-black text-[#b76b00]">
                  {activeQuestion.difficulty}
                </span>
              </div>
              <QuizQuestionShell question={activeQuestion} />
            </div>
            <aside className="border-l-2 border-[#e4e4e7] bg-[#f7f8fb] p-4 max-[900px]:border-l-0 max-[900px]:border-t-2">
              <p className="m-0 mb-3 text-[12px] font-black uppercase tracking-[0.1em] text-[#9f9fa9]">Primitive index</p>
              <div className="grid gap-2">
                {quizPrimitiveQuestions.map((question) => {
                  const Icon = quizPrimitiveTypeIcons[question.type] ?? ListChecks
                  const active = question.id === activeId
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setActiveId(question.id)}
                      className={`grid grid-cols-[22px_minmax(0,1fr)] items-center gap-3 rounded-[12px] border px-3 py-3 text-left transition ${
                        active
                          ? 'border-[#453dee] bg-white text-[#453dee] shadow-[0_10px_26px_rgba(58,47,211,0.10)]'
                          : 'border-transparent bg-transparent text-[#52525c] hover:bg-white'
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.5} />
                      <span className="min-w-0">
                        <strong className="block truncate text-[13px] font-black leading-tight">{question.title}</strong>
                        <small className="block truncate text-[11px] font-bold text-[#9f9fa9]">{question.type}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>
          </div>
        </section>

        <section className="rounded-[18px] border-2 border-[#e4e4e7] bg-[#f7f8fb] p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="m-0 text-[18px] font-black text-[#3f3f46]">Schema preview</h3>
              <p className="m-0 mt-1 text-[13px] font-bold text-[#71717b]">Same renderer, different data payloads.</p>
            </div>
            <Sparkles size={20} className="text-[#453dee]" />
          </div>
          <pre className="m-0 max-h-[470px] overflow-auto rounded-[14px] bg-[#27272a] p-4 text-[12px] font-semibold leading-6 text-[#f4f4f5]">
            {JSON.stringify(schemaPreview(activeQuestion), null, 2)}
          </pre>
        </section>
      </div>

      <div className="grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
        {groups.map((group) => (
          <section key={group.label} className="rounded-[16px] border border-[#e4e4e7] bg-white p-5">
            <h3 className="m-0 text-[16px] font-black text-[#3f3f46]">{group.label}</h3>
            <div className="mt-4 grid gap-2">
              {quizPrimitiveQuestions.filter((question) => group.types.includes(question.type)).map((question) => {
                const Icon = quizPrimitiveTypeIcons[question.type] ?? ListChecks
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setActiveId(question.id)}
                    className="grid grid-cols-[26px_minmax(0,1fr)_18px] items-center gap-3 rounded-[12px] bg-[#f7f8fb] px-3 py-3 text-left text-[#3f3f46] transition hover:-translate-y-0.5 hover:bg-[#eef2ff]"
                  >
                    <Icon size={18} className="text-[#453dee]" />
                    <span className="truncate text-[13px] font-black">{question.title}</span>
                    <Plus size={15} className="text-[#9f9fa9]" />
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
