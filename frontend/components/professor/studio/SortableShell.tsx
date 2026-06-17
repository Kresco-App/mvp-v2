'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={`${className} ${isDragging ? 'shadow-[0_18px_40px_rgba(24,24,27,0.14)]' : ''}`}>
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
