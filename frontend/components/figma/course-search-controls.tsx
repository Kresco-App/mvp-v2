import { ChevronDown } from 'lucide-react'

export type FigmaCourseSubjectOption = {
  label: string
  value: string
}

export function FigmaCourseSearchControls({
  query,
  subject,
  subjects,
  onQueryChange,
  onSubjectChange,
}: {
  query: string
  subject: string
  subjects: FigmaCourseSubjectOption[]
  onQueryChange: (value: string) => void
  onSubjectChange: (value: string) => void
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
    </header>
  )
}
