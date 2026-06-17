'use client'

import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'

export default function SortableShell({
  id,
  children,
  className = '',
  handleClassName = '',
}: {
  id: string
  children: React.ReactNode
  className?: string
  handleClassName?: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id })

  return (
    <div ref={setNodeRef} className={`${className} ${isDragging ? 'relative z-30 opacity-[0.85] shadow-[0_18px_40px_rgba(24,24,27,0.14)]' : ''}`}>
      <button
        type="button"
        aria-label="Glisser pour réordonner"
        className={`grid h-7 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-[#a1a1aa] transition hover:bg-[#f4f4f5] hover:text-[#52525c] active:cursor-grabbing ${handleClassName}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  )
}
