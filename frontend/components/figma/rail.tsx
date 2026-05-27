'use client'

import type React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { figmaChapterItems, figmaLessonItems } from './data'
import { FigmaProgressBar } from './progress'
import type { FigmaRailItem, FigmaRailSection } from './types'

export type CourseContentRailProps = {
  size?: 'compact' | 'workspace'
  completed?: number
  total?: number
  value?: number
  sections?: FigmaRailSection[]
  toolbar?: React.ReactNode
  onSectionToggle?: (section: FigmaRailSection) => void
  onItemSelect?: (item: FigmaRailItem, section: FigmaRailSection) => void
}

const defaultSections: FigmaRailSection[] = [
  { id: 'lesson', title: 'Lesson', copy: 'Learn the basics of the subject.', items: figmaLessonItems, open: true },
  { id: 'exercise', title: 'Exercise', copy: 'Learn by doing with interactive tasks.', open: false },
  { id: 'homework', title: 'Homework', copy: 'Learn by practicing with real-world problems.', open: false },
  { id: 'national-exam', title: 'National Exam Example', copy: 'Get yourself familiarized with the final boss', open: false },
]

export function CourseContentRail({
  size = 'compact',
  completed = 2,
  total = 30,
  value = 7,
  sections = defaultSections,
  toolbar,
  onSectionToggle,
  onItemSelect,
}: CourseContentRailProps) {
  const isWorkspace = size === 'workspace'

  return (
    <aside
      className={`grid ${isWorkspace ? 'w-[492px] gap-[30px]' : 'w-[351px] gap-[30px]'} max-[1100px]:w-full`}
      data-figma-course-rail
      aria-label="Course content"
    >
      <CourseProgressHeader completed={completed} total={total} value={value} size={size} />
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
}: {
  completed?: number
  total?: number
  value?: number
  size?: 'compact' | 'workspace'
}) {
  const isWorkspace = size === 'workspace'

  return (
    <div className={`grid ${isWorkspace ? 'gap-[12px]' : 'gap-[10px]'}`}>
      <strong
        className={`font-bold leading-[1.1] text-[#34343d] ${
          isWorkspace ? 'text-[24px] tracking-normal' : 'text-[16px] tracking-[0.24px]'
        }`}
      >
        Course content
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
  variant,
  size = 'compact',
}: {
  title: string
  copy: string
  items?: FigmaRailItem[]
  open?: boolean
  onToggle?: () => void
  onItemSelect?: (item: FigmaRailItem) => void
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
        className={`flex w-full cursor-pointer items-start border-0 bg-transparent text-left ${
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
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className={`grid shrink-0 place-items-center text-[#565760] ${isWorkspace ? 'h-[24px] w-[24px]' : 'h-[18px] w-[18px]'}`}
          transition={{ duration: 0.18 }}
        >
          <ChevronDown size={isWorkspace ? 24 : 18} strokeWidth={3} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && items.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className={`grid ${isWorkspace ? 'gap-[24px] px-[26px] pb-[31px]' : 'gap-[12px] px-[18px] pb-[24px]'}`}>
              {items.map((item) => (
                <RailItemRow item={item} key={item.id ?? item.label} onSelect={onItemSelect} size={size} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function RailItemRow({
  item,
  onSelect,
  size = 'compact',
}: {
  item: FigmaRailItem
  onSelect?: (item: FigmaRailItem) => void
  size?: 'compact' | 'workspace'
}) {
  const isActive = Boolean(item.active || item.completed)
  const isLocked = Boolean(item.disabled)
  const isWorkspace = size === 'workspace'

  return (
    <button type="button"
      className={`flex w-full items-center border-0 bg-transparent p-0 text-left ${
        isWorkspace ? 'gap-[20px]' : 'gap-[8px]'
      } ${isLocked ? 'cursor-pointer opacity-75 hover:translate-x-0.5' : 'cursor-pointer hover:translate-x-0.5'} transition-transform duration-150`}
      aria-label={isLocked ? `${item.label} locked preview` : undefined}
      onClick={() => onSelect?.(item)}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full ${isWorkspace ? 'h-[36px] w-[36px]' : 'h-[24px] w-[24px]'} ${
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
