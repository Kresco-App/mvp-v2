import { ChevronDown } from 'lucide-react'

export type FigmaCourseSubjectOption = {
  label: string
  value: string
}

export type FigmaCourseStatusFilter = 'all' | 'unlocked' | 'locked' | 'in_progress' | 'completed'

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
  return (
    <header className="mb-[32px]">
      <div className="flex flex-wrap items-start gap-[18px]">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-[44px] w-[280px] max-w-full rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] px-[16px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46] outline-none transition placeholder:text-[#9f9fa9] focus:border-[#d4d4d8] focus:bg-white"
          placeholder="Search courses"
          type="search"
        />

        <div className="relative h-[44px] w-[170px] max-w-full">
          <select
            value={subject}
            onChange={(event) => onSubjectChange(event.target.value)}
            className={`h-full w-full appearance-none rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] pl-[16px] pr-[39px] text-[16px] font-bold leading-[1.1] tracking-[0.24px] outline-none transition focus:border-[#d4d4d8] focus:bg-white ${subject ? 'text-[#3f3f46]' : 'text-[#9f9fa9]'}`}
          >
            <option value="">Subject</option>
            {subjects.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-[#9f9fa9]" size={15} strokeWidth={3} />
        </div>
      </div>

      <div className="mt-[14px] flex max-w-full flex-wrap gap-[8px] rounded-[14px] border border-[#e4e4e7] bg-[#f4f4f5] p-[4px]">
        {courseStatusOptions.map((item) => {
          const active = status === item.value
          return (
            <button
              key={item.value}
              className={`h-[36px] rounded-[10px] px-[14px] text-[14px] font-bold leading-[1.1] tracking-[0.18px] transition ${
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
