'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BookOpen, CalendarDays, CheckCircle2, FileText, Play, Search, Trophy } from 'lucide-react'
import api from '@/lib/axios'
import { SkeletonBlock } from '@/components/figma'

interface ExamProblem {
  id: number
  topic_id?: number | null
  title: string
  statement: string
  written_solution: string
  written_solution_url: string
  difficulty: string
  concept_slugs: string[]
  video_resource?: { id: number; title: string; provider: string; provider_resource_id: string } | null
}

interface Exam {
  id: number
  subject_id: number
  subject_title: string
  title: string
  year: number
  session: string
  statement_url: string
  problems: ExamProblem[]
}

export default function ExamBankPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'Exam Bank - Kresco' }, [])

  useEffect(() => {
    api.get('/courses/exam-bank')
      .then((res) => setExams(res.data))
      .catch(() => toast.error('Could not load Exam Bank.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return exams
    return exams
      .map((exam) => ({
        ...exam,
        problems: exam.problems.filter((problem) => [
          exam.title,
          exam.subject_title,
          String(exam.year),
          problem.title,
          problem.statement,
          ...problem.concept_slugs,
        ].join(' ').toLowerCase().includes(q)),
      }))
      .filter((exam) => exam.problems.length > 0)
  }, [exams, query])

  return (
    <div className="figma-container">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff7df] text-[#f5900b]">
            <Trophy size={26} />
          </div>
          <h1 className="figma-title m-0 text-[34px]">Exam Bank</h1>
          <p className="figma-subtle m-0 mt-1 text-sm">National exam problems with written and video correction status.</p>
        </div>
        <div className="relative w-full lg:w-[380px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="figma-input w-full pl-11" placeholder="Search year, topic, concept..." />
        </div>
      </header>

      {loading ? (
        <div className="grid gap-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <section key={index} className="figma-card kresco-enter overflow-hidden" style={{ animationDelay: `${index * 60}ms` }}>
              <div className="border-b border-[#e4e4e7] p-5">
                <SkeletonBlock className="h-3 w-40 rounded-md" />
                <SkeletonBlock className="mt-3 h-5 w-72 max-w-full rounded-md" />
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, problemIndex) => (
                  <article key={problemIndex} className="rounded-2xl border border-[#e4e4e7] bg-[#fbfcff] p-5">
                    <SkeletonBlock className="h-4 w-[58%] rounded-md" />
                    <SkeletonBlock className="mt-3 h-3 w-full rounded-md" />
                    <SkeletonBlock className="mt-2 h-3 w-[72%] rounded-md" />
                    <div className="mt-5 flex gap-2">
                      <SkeletonBlock className="h-8 w-20 rounded-xl" />
                      <SkeletonBlock className="h-8 w-24 rounded-xl" />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {filtered.map((exam) => (
            <section key={exam.id} className="figma-card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[#e4e4e7] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-black text-[#71717b]">
                    <span className="inline-flex items-center gap-1"><BookOpen size={14} /> {exam.subject_title}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> {exam.year}</span>
                  </div>
                  <h2 className="m-0 text-lg font-black text-[#3f3f46]">{exam.title}</h2>
                </div>
                <span className="rounded-2xl bg-[#eaf8ff] px-4 py-2 text-xs font-black text-[#1292cf]">{exam.problems.length} problem(s)</span>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {exam.problems.map((problem) => (
                  <article key={problem.id} className="rounded-2xl border border-[#e4e4e7] bg-[#fbfcff] p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="m-0 text-base font-black text-[#3f3f46]">{problem.title}</h3>
                        <p className="m-0 mt-2 line-clamp-3 text-sm font-semibold leading-relaxed text-[#71717b]">{problem.statement}</p>
                      </div>
                      <span className="rounded-xl bg-[#fff7df] px-3 py-1 text-[11px] font-black text-[#b76b00]">{problem.difficulty}</span>
                    </div>
                    <div className="mb-5 flex flex-wrap gap-2">
                      {problem.concept_slugs.slice(0, 5).map((concept) => (
                        <span key={concept} className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-black text-[#71717b] shadow-sm">{concept}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {problem.topic_id && (
                        <Link href={`/topics/${problem.topic_id}`} className="figma-button">
                          <Play size={14} />
                          Open topic
                        </Link>
                      )}
                      <span className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-4 text-xs font-black text-[#71717b]">
                        <FileText size={14} />
                        Written
                      </span>
                      {problem.video_resource && (
                        <span className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-4 text-xs font-black text-[#71717b]">
                          <CheckCircle2 size={14} />
                          Video
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
