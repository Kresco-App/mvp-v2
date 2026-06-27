'use client'

import type React from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { figmaChapterItems, figmaLessonItems } from './data'
import { FigmaProgressBar } from './progress'
import type { FigmaRailItem, FigmaRailSection } from './types'

const railControlMotionClass = 'transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const railChevronMotionClass = 'transition-[color,transform] duration-150 ease-out motion-reduce:transition-none'
const railItemMotionClass = 'transition-[background-color,color,opacity,transform] duration-150 ease-out hover:translate-x-0.5 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:active:scale-100'
const railItemIconMotionClass = 'transition-[background-color,transform] duration-150 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100'

export type CourseContentRailProps = {
  size?: 'compact' | 'workspace'
  heading?: string
  completed?: number
  total?: number
  value?: number
  sections?: FigmaRailSection[]
  toolbar?: React.ReactNode
  onSectionToggle?: (section: FigmaRailSection) => void
  onItemSelect?: (item: FigmaRailItem, section: FigmaRailSection) => void
  onItemPreload?: (item: FigmaRailItem, section: FigmaRailSection) => void
}

const defaultSections: FigmaRailSection[] = [
  { id: 'lesson', title: 'Lecons', copy: 'Notions essentielles.', items: figmaLessonItems, open: true },
  { id: 'exercise', title: 'Exercices', copy: 'Application directe.', open: false },
  { id: 'homework', title: 'Devoirs blancs', copy: 'Sujet court.', open: false },
  { id: 'national-exam', title: "Extraits d'examen", copy: "Question d'examen.", open: false },
]

export function CourseContentRail({
  size = 'compact',
  heading = 'Course content',
  completed = 2,
  total = 30,
  value = 7,
  sections = defaultSections,
  toolbar,
  onSectionToggle,
  onItemSelect,
  onItemPreload,
}: CourseContentRailProps) {
  const isWorkspace = size === 'workspace'

  return (
    <aside
      className={`grid ${isWorkspace ? 'w-[492px] gap-[30px]' : 'w-[351px] gap-[30px]'} max-[1100px]:w-full`}
      data-figma-course-rail
      aria-label="Course content"
    >
      <CourseProgressHeader completed={completed} total={total} value={value} size={size} heading={heading} />
      {toolbar}
      <div className="grid gap-[22px]">
        {sections.map((section) => (
          <RailCard
            key={section.id}
            title={section.title}
            copy={section.copy}
            items={section.items}
            open={section.open}
            size={size}
            onToggle={() => onSectionToggle?.(section)}
            onItemSelect={(item) => onItemSelect?.(item, section)}
            onItemPreload={(item) => onItemPreload?.(item, section)}
          />
        ))}
      </div>
    </aside>
  )
}

export function CourseProgressHeader({
  completed = 2,
  total = 30,
  value = 7,
  size = 'compact',
  heading = 'Course content',
}: {
  completed?: number
  total?: number
  value?: number
  size?: 'compact' | 'workspace'
  heading?: string
}) {
  const isWorkspace = size === 'workspace'

  return (
    <div className={`grid ${isWorkspace ? 'gap-[12px]' : 'gap-[10px]'}`}>
      <strong
        className={`font-bold leading-[1.1] text-[#34343d] ${
          isWorkspace ? 'text-[24px] tracking-normal' : 'text-[16px] tracking-[0.24px]'
        }`}
      >
        {heading}
      </strong>
      <div
        className={`flex justify-between gap-4 font-bold leading-none text-[#70727d] ${
          isWorkspace ? 'text-[21px] tracking-normal' : 'text-[14px] tracking-[0.21px]'
        }`}
      >
        <span>{completed}/{total} Completed</span>
        <span>{value}%</span>
      </div>
      <FigmaProgressBar value={value} tone="purple" size={isWorkspace ? 'default' : 'course'} />
    </div>
  )
}

export function RailCard({
  title,
  copy,
  items = [],
  open = false,
  onToggle,
  onItemSelect,
  onItemPreload,
  variant,
  size = 'compact',
}: {
  title: string
  copy: string
  items?: FigmaRailItem[]
  open?: boolean
  onToggle?: () => void
  onItemSelect?: (item: FigmaRailItem) => void
  onItemPreload?: (item: FigmaRailItem) => void
  variant?: 'chapter'
  size?: 'compact' | 'workspace'
}) {
  const isChapter = variant === 'chapter'
  const isWorkspace = size === 'workspace'

  return (
    <section
      className={`overflow-hidden bg-white shadow-none max-[1100px]:w-full kresco-hover-lift ${
        isWorkspace ? 'w-[492px] rounded-[22px] border-[3px] border-[#e4e4e7]' : 'w-[351px] rounded-[16px] border-2 border-[#e4e4e7]'
      } ${
        isChapter ? 'min-h-[411px]' : ''
      }`}
    >
      <button
        aria-expanded={open}
        className={`group flex w-full cursor-pointer items-start border-0 bg-transparent text-left ${railControlMotionClass} hover:bg-[#fbfbff] ${
          isWorkspace ? 'min-h-[113px] gap-[18px] px-[26px] py-[27px]' : 'gap-[8px] px-[18px] py-[18px]'
        }`}
        onClick={onToggle}
        type="button"
      >
        <span className={`grid min-w-0 flex-1 leading-[1.1] ${isWorkspace ? 'gap-[6px]' : 'gap-[4px]'}`}>
          <strong
            className={`font-bold text-[#3f3f46] ${
              isWorkspace ? 'text-[24px] tracking-normal' : 'text-[16px] tracking-[0.24px]'
            }`}
          >
            {title}
          </strong>
          <span
            className={`font-bold text-[#71717b] ${
              isWorkspace ? 'text-[20px] leading-[1.16] tracking-normal' : 'text-[14px] tracking-[0.21px]'
            }`}
          >
            {copy}
          </span>
        </span>
        <span className={`grid shrink-0 place-items-center text-[#565760] group-hover:text-[#453dee] ${railChevronMotionClass} ${open ? 'rotate-180' : 'rotate-0'} ${isWorkspace ? 'h-[24px] w-[24px]' : 'h-[18px] w-[18px]'}`}>
          <ChevronDown size={isWorkspace ? 24 : 18} strokeWidth={3} />
        </span>
      </button>

      {open && items.length > 0 && (
        <div className="overflow-hidden">
          <div className={`grid ${isWorkspace ? 'gap-[24px] px-[26px] pb-[31px]' : 'gap-[12px] px-[18px] pb-[24px]'}`}>
            {items.map((item) => (
              <RailItemRow
                item={item}
                key={item.id ?? item.label}
                onPreload={onItemPreload}
                onSelect={onItemSelect}
                size={size}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RailItemRow({
  item,
  onPreload,
  onSelect,
  size = 'compact',
}: {
  item: FigmaRailItem
  onPreload?: (item: FigmaRailItem) => void
  onSelect?: (item: FigmaRailItem) => void
  size?: 'compact' | 'workspace'
}) {
  const isActive = Boolean(item.active || item.completed)
  const isLocked = Boolean(item.disabled)
  const isWorkspace = size === 'workspace'

  return (
    <button
      type="button"
      className={`group flex w-full items-center rounded-[12px] border-0 bg-transparent p-0 text-left ${
        isWorkspace ? 'gap-[20px]' : 'gap-[8px]'
      } ${isLocked ? 'cursor-pointer opacity-75' : 'cursor-pointer hover:bg-[#fbfbff]'} ${railItemMotionClass}`}
      aria-label={isLocked ? `${item.label} locked preview` : undefined}
      onClick={() => onSelect?.(item)}
      onFocus={() => onPreload?.(item)}
      onPointerEnter={() => onPreload?.(item)}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full ${railItemIconMotionClass} ${isWorkspace ? 'h-[36px] w-[36px]' : 'h-[24px] w-[24px]'} ${
          isActive ? 'bg-[#f5900b]' : isLocked ? 'bg-[#a1a1aa]' : 'bg-[#e5e7eb]'
        } text-white`}
      >
        {isActive ? <Check size={isWorkspace ? 24 : 16} strokeWidth={3.5} /> : isLocked ? <Lock size={isWorkspace ? 18 : 12} strokeWidth={3.2} /> : null}
      </span>
      <span className={`min-w-0 flex-1 ${isWorkspace ? 'py-0' : 'py-[5px]'}`}>
        <strong
          className={`block truncate leading-[1.1] ${
            isWorkspace ? 'text-[26px] font-medium tracking-normal' : 'text-[16px] font-bold tracking-[0.24px]'
          } ${isActive ? 'text-[#f5900b]' : isLocked ? 'text-[#9f9fa9]' : 'text-[#6a7282]'}`}
        >
          {item.label}
        </strong>
        {item.meta && <span className={`mt-1 block truncate font-bold ${isWorkspace ? 'text-[15px]' : 'text-[12px]'} text-[#9f9fa9]`}>{item.meta}</span>}
      </span>
    </button>
  )
}

export function ChapterRail() {
  return <RailCard title="Chapters" copy="Keep the flow of knowledge ongoing!" items={figmaChapterItems} open variant="chapter" />
}
