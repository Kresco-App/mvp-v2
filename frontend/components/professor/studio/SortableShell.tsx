'use client'

import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'

const studioDragHandleClass =
  'kresco-drag-surface grid h-10 w-10 shrink-0 cursor-grab touch-none place-items-center rounded-[10px] text-[#a1a1aa] transition-[background-color,box-shadow,color] duration-150 ease-out hover:bg-[#f4f4f5] hover:text-[#52525c] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none'

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
        data-kresco-drag-surface="true"
        className={`${studioDragHandleClass} ${handleClassName}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  )
}
