'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { CourseStatusFilter } from '@/lib/courseFilters'
import { useClickOutside } from '@/hooks/useClickOutside'

export type FigmaCourseSubjectOption = {
  label: string
  value: string
}

export type FigmaCourseStatusFilter = CourseStatusFilter

const DROPDOWN_CLOSE_MS = 150
const controlMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const optionMotionClass = 'transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const dropdownMotionClass = '[--dropdown-close-dur:150ms] [--dropdown-open-dur:200ms] [--dropdown-pre-scale:0.97]'

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
  const subjectButtonRef = useRef<HTMLButtonElement>(null)
  const selectedSubject = subjects.find((item) => item.value === subject)
  const subjectDropdown = useDropdownPresence(subjectOpen)

  useClickOutside(subjectRef, () => setSubjectOpen(false), { eventName: 'pointerdown' })

  function handleSubjectKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setSubjectOpen(false)
    subjectButtonRef.current?.focus()
  }

  return (
    <header className="mb-[32px]">
      <div className="flex min-w-0 flex-wrap items-start gap-[18px]">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-[44px] w-[280px] max-w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] px-[16px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-[#9f9fa9] focus:border-[#d4d4d8] focus:bg-white focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none"
          placeholder="Search courses"
          type="search"
          aria-label="Search courses"
        />

        <div className="relative h-[44px] w-[170px] max-w-full" ref={subjectRef}>
          <button
            type="button"
            ref={subjectButtonRef}
            onClick={() => setSubjectOpen((value) => !value)}
            onKeyDown={handleSubjectKeyDown}
            className={`flex h-full w-full items-center justify-between rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] pl-[16px] pr-[12px] text-left text-[16px] font-bold leading-[1.1] tracking-[0.24px] outline-none hover:bg-white focus:border-[#d4d4d8] focus:bg-white ${controlMotionClass} ${
              selectedSubject ? 'text-[#3f3f46]' : 'text-[#9f9fa9]'
            }`}
            aria-label="Filter courses by subject"
            aria-expanded={subjectOpen}
            aria-haspopup="listbox"
          >
            <span className="truncate">{selectedSubject?.label || 'Subject'}</span>
            <ChevronDown className={`shrink-0 text-[#9f9fa9] transition-[transform] duration-150 ease-out motion-reduce:transition-none ${subjectOpen ? 'rotate-180' : ''}`} size={15} strokeWidth={3} />
          </button>

          {subjectDropdown.present && (
            <div
              className={`t-dropdown ${subjectDropdown.stateClass} ${dropdownMotionClass} absolute left-0 top-[calc(100%+8px)] z-40 w-[210px] overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white p-1.5 shadow-[0_18px_40px_rgba(24,24,27,0.14)]`}
              data-origin="top-left"
              role="listbox"
              onKeyDown={handleSubjectKeyDown}
            >
              <button
                type="button"
                role="option"
                aria-selected={!subject}
                onClick={() => {
                  onSubjectChange('')
                  setSubjectOpen(false)
                }}
                className={`flex h-10 w-full items-center justify-between rounded-[11px] px-3 text-left text-[14px] font-bold ${optionMotionClass} ${
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
                  className={`flex h-10 w-full items-center justify-between rounded-[11px] px-3 text-left text-[14px] font-bold ${optionMotionClass} ${
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
                aria-pressed={active}
                className={`min-h-10 rounded-[10px] px-[10px] text-[12px] font-bold leading-[1.1] tracking-[0.12px] ${controlMotionClass} ${
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

function useDropdownPresence(open: boolean) {
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setPresent(true)
      setClosing(false)
      return
    }

    if (!present) return

    setClosing(true)
    const timeout = window.setTimeout(() => {
      setPresent(false)
      setClosing(false)
    }, DROPDOWN_CLOSE_MS)

    return () => window.clearTimeout(timeout)
  }, [open, present])

  return {
    present,
    stateClass: open && !closing ? 'is-open' : closing ? 'is-closing' : '',
  }
}
