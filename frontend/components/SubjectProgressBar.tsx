'use client'

import { cn } from '@/lib/utils'

interface Props {
  progress: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const HEIGHT_BY_SIZE = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
}

export default function SubjectProgressBar({
  progress,
  size = 'sm',
  className = '',
}: Props) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  const isComplete = safeProgress >= 100

  return (
    <div className={cn('overflow-hidden rounded-full bg-slate-100', HEIGHT_BY_SIZE[size], className)}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${safeProgress}%`,
          background: isComplete
            ? 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
            : 'linear-gradient(90deg, #4F46E5 0%, #818CF8 100%)',
          boxShadow: isComplete ? '0 0 10px rgba(16, 185, 129, 0.3)' : 'none',
        }}
      />
    </div>
  )
}
