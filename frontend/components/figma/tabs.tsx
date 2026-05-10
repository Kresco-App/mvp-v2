'use client'

import { motion } from 'framer-motion'
import { Droplet, Sun } from 'lucide-react'
import type { FigmaTabItem } from './types'

export function LearningTabBar({
  tabs,
  onSelect,
  size = 'compact',
}: {
  tabs: FigmaTabItem[]
  onSelect?: (tab: FigmaTabItem) => void
  size?: 'compact' | 'workspace'
}) {
  const isWorkspace = size === 'workspace'

  return (
    <nav
      className={`relative flex items-center gap-[8px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isWorkspace ? 'h-[83px]' : 'h-[57px]'
      }`}
      data-figma-tabs
      aria-label="Workspace tabs"
    >
      <span
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-0 bg-[#e4e4e7] ${
          isWorkspace ? 'h-[3px]' : 'h-0.5'
        }`}
        aria-hidden="true"
      />
      {tabs.map((tab) => {
        const { label, icon: Icon, active } = tab
        return (
        <button
          className={`relative inline-flex items-center whitespace-nowrap border-0 bg-transparent font-bold leading-none tracking-normal transition-colors duration-200 ${
            active ? 'text-[#453dee]' : 'text-[#565760] hover:text-[#453dee]'
          } ${
            isWorkspace
              ? '-mb-[3px] h-[83px] gap-[13px] px-[25px] text-[24px]'
              : '-mb-0.5 h-[57px] gap-[10px] px-[10px] text-[16px]'
          }`}
          key={label}
          onClick={() => onSelect?.(tab)}
          type="button"
        >
          <Icon size={isWorkspace ? 25 : 18} strokeWidth={2.7} />
          {label}
          {active && (
            <motion.span
              layoutId={`figma-tab-active-${size}`}
              className={`pointer-events-none absolute left-[10px] right-[10px] z-20 rounded-full bg-[#453dee] ${
                isWorkspace ? 'bottom-0 h-[3px]' : 'bottom-0 h-[3px]'
              }`}
              transition={{ type: 'spring', stiffness: 430, damping: 36 }}
            />
          )}
        </button>
        )
      })}
    </nav>
  )
}

export function FigmaSegmentedChoice({ value = 'sun' }: { value?: 'sun' | 'laser' }) {
  const options = [
    { key: 'sun', label: 'Sun light', Icon: Sun },
    { key: 'laser', label: 'Laser', Icon: Droplet },
  ] as const

  return (
    <div className="relative flex w-[243px] items-center gap-px rounded-[10.33px] border-2 border-[#e4e4e7] bg-[#f4f4f5] p-[3px]">
      <motion.span
        className={`absolute top-1/2 h-[38px] w-[118px] -translate-y-1/2 rounded-[7.33px] bg-[#453dee] ${value === 'laser' ? 'right-px' : 'left-px'}`}
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      />
      {options.map(({ key, label, Icon }) => {
        const active = value === key
        return (
          <button
            className={`relative z-[1] inline-flex h-[38px] w-[118px] items-center justify-center gap-1.5 rounded-[7.33px] border-0 bg-transparent px-4 text-[16px] font-bold leading-[1.1] tracking-[0.24px] ${
              active ? 'text-white' : 'text-[#3f3f46]'
            }`}
            key={key}
            type="button"
          >
            <Icon size={19} strokeWidth={2.6} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
