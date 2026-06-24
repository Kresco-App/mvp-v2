'use client'

import { useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { CourseStatusFilter } from '@/lib/courseFilters'
import { useClickOutside } from '@/hooks/useClickOutside'

export type FigmaCourseSubjectOption = {
  label: string
  value: string
}

export type FigmaCourseStatusFilter = CourseStatusFilter

export function FigmaCourseSearchControls({
  query,
  subject,
  status,
  subjects,
  onQueryChange,
  onSubjectChange,
  onStatusChange,
}: {
  query: string
  subject: string
  status: FigmaCourseStatusFilter
  subjects: FigmaCourseSubjectOption[]
  onQueryChange: (value: string) => void
  onSubjectChange: (value: string) => void
  onStatusChange: (value: FigmaCourseStatusFilter) => void
}) {
  const [subjectOpen, setSubjectOpen] = useState(false)
  const subjectRef = useRef<HTMLDivElement>(null)
  const selectedSubject = subjects.find((item) => item.value === subject)

  useClickOutside(subjectRef, () => setSubjectOpen(false), { eventName: 'pointerdown' })

  return (
    <header className="mb-[32px]">
      <div className="flex min-w-0 flex-wrap items-start gap-[18px]">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-[44px] w-[280px] max-w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] px-[16px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46] outline-none transition-[background-color,border-color] duration-200 placeholder:text-[#9f9fa9] focus:border-[#d4d4d8] focus:bg-white"
          placeholder="Search courses"
          type="search"
        />

        <div className="relative h-[44px] w-[170px] max-w-full" ref={subjectRef}>
          <button
            type="button"
            onClick={() => setSubjectOpen((value) => !value)}
            className={`flex h-full w-full items-center justify-between rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] pl-[16px] pr-[12px] text-left text-[16px] font-bold leading-[1.1] tracking-[0.24px] outline-none transition-[background-color,border-color,transform] duration-200 hover:bg-white active:scale-[0.96] focus:border-[#d4d4d8] focus:bg-white ${
              selectedSubject ? 'text-[#3f3f46]' : 'text-[#9f9fa9]'
            }`}
            aria-expanded={subjectOpen}
            aria-haspopup="listbox"
          >
            <span className="truncate">{selectedSubject?.label || 'Subject'}</span>
            <ChevronDown className={`shrink-0 text-[#9f9fa9] transition-transform ${subjectOpen ? 'rotate-180' : ''}`} size={15} strokeWidth={3} />
          </button>

          {subjectOpen && (
            <div
              className="absolute left-0 top-[calc(100%+8px)] z-40 w-[210px] overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white p-1.5 shadow-[0_18px_40px_rgba(24,24,27,0.14)]"
              role="listbox"
            >
              <button
                type="button"
                role="option"
                aria-selected={!subject}
                onClick={() => {
                  onSubjectChange('')
                  setSubjectOpen(false)
                }}
                className={`flex h-10 w-full items-center justify-between rounded-[11px] px-3 text-left text-[14px] font-bold transition-[background-color,color,transform] duration-200 active:scale-[0.96] ${
                  !subject ? 'bg-[#f0f0ff] text-[#453dee]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                }`}
              >
                Subject
                {!subject && <Check size={15} strokeWidth={3} />}
              </button>
              {subjects.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={subject === item.value}
                  onClick={() => {
                    onSubjectChange(item.value)
                    setSubjectOpen(false)
                  }}
                  className={`flex h-10 w-full items-center justify-between rounded-[11px] px-3 text-left text-[14px] font-bold transition-[background-color,color,transform] duration-200 active:scale-[0.96] ${
                    subject === item.value ? 'bg-[#f0f0ff] text-[#453dee]' : 'text-[#52525c] hover:bg-[#f4f4f5]'
                  }`}
                >
                  {item.label}
                  {subject === item.value && <Check size={15} strokeWidth={3} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex w-fit max-w-full flex-wrap gap-[4px] rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] p-[4px]">
          {courseStatusOptions.map((item) => {
            const active = status === item.value
            return (
              <button
                key={item.value}
                className={`min-h-10 rounded-[10px] px-[10px] text-[12px] font-bold leading-[1.1] tracking-[0.12px] transition-[background-color,box-shadow,color,transform] duration-200 active:scale-[0.96] ${
                  active ? 'bg-white text-[#3f3f46] shadow-[0_1px_2px_rgba(24,24,27,.08)]' : 'text-[#71717b] hover:bg-white/70'
                }`}
                type="button"
                onClick={() => onStatusChange(item.value)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

const courseStatusOptions: { label: string; value: FigmaCourseStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unlocked', value: 'unlocked' },
  { label: 'Locked', value: 'locked' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
]
