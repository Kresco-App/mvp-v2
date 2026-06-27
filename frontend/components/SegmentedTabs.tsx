'use client'

import { useEffect, useRef } from 'react'

type SegmentedTabOption<T extends string> = {
  value: T
  label: string
}

export default function SegmentedTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string
  value: T
  options: Array<SegmentedTabOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const positionedRef = useRef(false)

  function selectOptionAt(index: number, focus = false) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    if (!focus) return
    requestAnimationFrame(() => {
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
    })
  }

  function moveSelection(currentValue: T, direction: -1 | 1) {
    if (options.length === 0) return
    const currentIndex = options.findIndex((option) => option.value === currentValue)
    if (currentIndex === -1) return
    const nextIndex = (currentIndex + direction + options.length) % options.length
    selectOptionAt(nextIndex, true)
  }

  useEffect(() => {
    const root = rootRef.current
    const pill = pillRef.current
    if (!root || !pill) return

    function movePill(animate: boolean) {
      const rootNode = rootRef.current
      const pillNode = pillRef.current
      if (!rootNode || !pillNode) return
      const activeTab = rootNode.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      if (!activeTab) return

      if (!animate) {
        const previousTransition = pillNode.style.transition
        pillNode.style.transition = 'none'
        pillNode.style.transform = `translateX(${activeTab.offsetLeft}px)`
        pillNode.style.width = `${activeTab.offsetWidth}px`
        void pillNode.offsetWidth
        pillNode.style.transition = previousTransition
        return
      }

      pillNode.style.transform = `translateX(${activeTab.offsetLeft}px)`
      pillNode.style.width = `${activeTab.offsetWidth}px`
    }

    const frame = requestAnimationFrame(() => {
      movePill(positionedRef.current)
      positionedRef.current = true
    })
    const handleResize = () => movePill(false)
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  }, [value, options])

  return (
    <div ref={rootRef} className={`t-tabs ${className}`} role="tablist" aria-label={label}>
      <span ref={pillRef} className="t-tabs-pill shadow-[0_8px_18px_rgba(15,23,42,0.08)]" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              moveSelection(option.value, -1)
            } else if (event.key === 'ArrowRight') {
              event.preventDefault()
              moveSelection(option.value, 1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              selectOptionAt(0, true)
            } else if (event.key === 'End') {
              event.preventDefault()
              selectOptionAt(options.length - 1, true)
            }
          }}
          className="t-tab min-w-[78px] text-[12px] font-black"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
