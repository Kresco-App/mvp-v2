'use client'

import { Droplet, Sun } from 'lucide-react'
import type { FigmaTabItem } from './types'

const tabButtonMotionClass = 'transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'
const tabIconMotionClass = 'transition-[transform] duration-150 ease-out group-hover:-translate-y-px motion-reduce:transition-none motion-reduce:group-hover:translate-y-0'
const segmentedButtonMotionClass = 'transition-[color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'

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
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            className={`group relative inline-flex items-center whitespace-nowrap border-0 bg-transparent font-bold leading-none tracking-normal ${tabButtonMotionClass} ${
              active ? 'bg-[#f7f7ff] text-[#453dee]' : 'text-[#565760] hover:bg-[#f8f8fb] hover:text-[#453dee]'
            } ${
              isWorkspace
                ? '-mb-[3px] h-[83px] gap-[13px] rounded-[16px] px-[25px] text-[24px]'
                : '-mb-0.5 h-[57px] gap-[10px] rounded-[12px] px-[10px] text-[16px]'
            }`}
            key={label}
            onClick={() => onSelect?.(tab)}
          >
            <Icon className={tabIconMotionClass} size={isWorkspace ? 25 : 18} strokeWidth={2.7} />
            <span className="max-[480px]:hidden">{label}</span>
            {active && (
              <span
                className={`pointer-events-none absolute left-[10px] right-[10px] z-20 rounded-full bg-[#453dee] shadow-[0_4px_10px_rgba(69,61,238,0.22)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
                  isWorkspace ? 'bottom-0 h-[3px]' : 'bottom-0 h-[3px]'
                }`}
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
      <span
        className={`absolute left-[3px] top-1/2 h-[38px] w-[118px] -translate-y-1/2 rounded-[7.33px] bg-[#453dee] shadow-[0_5px_14px_rgba(69,61,238,0.18)] transition-[transform] duration-150 ease-out motion-reduce:transition-none ${value === 'laser' ? 'translate-x-[119px]' : 'translate-x-0'}`}
      />
      {options.map(({ key, label, Icon }) => {
        const active = value === key
        return (
          <button
            aria-pressed={active}
            className={`group relative z-[1] inline-flex h-[38px] w-[118px] items-center justify-center gap-1.5 rounded-[7.33px] border-0 bg-transparent px-4 text-[16px] font-bold leading-[1.1] tracking-[0.24px] ${segmentedButtonMotionClass} ${
              active ? 'text-white' : 'text-[#3f3f46] hover:text-[#453dee]'
            }`}
            key={key}
            type="button"
          >
            <Icon className={tabIconMotionClass} size={19} strokeWidth={2.6} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
