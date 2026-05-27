import Link from 'next/link'
import type { KeyboardEventHandler } from 'react'

export type FigmaSubjectCourseCardState = 'completed' | 'current' | 'available' | 'locked' | 'upcoming'

export type FigmaSubjectCourseCardProps = {
  index: number
  eyebrow?: string
  title: string
  description?: string
  progress: number
  lessonCount?: number
  xp?: number
  href?: string
  imageUrl?: string
  onClick?: () => void
  state: FigmaSubjectCourseCardState
}

const PLACEHOLDER_IMAGE = '/figma-assets/course-card-placeholder.png'

export function FigmaSubjectCourseCard({
  index,
  title,
  description,
  progress,
  href,
  imageUrl,
  onClick,
  state,
}: FigmaSubjectCourseCardProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))
  const isCompleted = state === 'completed'
  const isCurrent = state === 'current'
  const isLocked = state === 'locked'
  const isUpcoming = state === 'upcoming'
  const isUnavailable = isLocked || isUpcoming
  const label = isCompleted ? 'Well Done' : isCurrent ? 'Continue' : isLocked ? 'Locked' : isUpcoming ? 'Coming soon' : 'Start the lesson'
  const progressWidth = Math.max(24, Math.round((safeProgress / 100) * 320))

  const borderColor = isCompleted ? '#fcc94d' : isCurrent ? '#5b60f9' : '#e4e4e7'
  const imageBorderColor = isCompleted ? '#fcc94d' : isCurrent ? '#5b60f9' : '#d4d4d8'
  const badgeClass = isCompleted
    ? 'border-[#fbae17] bg-[#f5900b] text-white'
    : isCurrent
      ? 'border-[#5b60f9] bg-white text-[#5b60f9]'
      : isUnavailable
        ? 'border-[#d4d4d8] bg-[#f4f4f5] text-[#9f9fa9]'
        : 'border-[#d4d4d8] bg-white text-[#71717b]'

  const card = (
    <article
      className={`group kresco-enter relative h-[327.5px] w-full max-w-[344.33px] shrink-0 overflow-visible rounded-[16px] p-[2px] ${isUnavailable ? 'opacity-80' : ''}`}
      style={{
        background: borderColor,
        animationDelay: `${Math.min(index * 45, 220)}ms`,
        boxShadow: isCompleted
          ? '0 3.75px 0 #f5900b'
          : isCurrent
            ? '0 3.75px 0 #383dc7'
            : '0 3.75px 0 #d9dadd',
      }}
    >
      <div
        className={`flex h-full flex-col overflow-hidden rounded-[14px] transition duration-200 ${isCompleted ? 'bg-[#fbae17]' : 'bg-white'}`}
      >
        <div
          className="relative h-[193.5px] w-full overflow-hidden border-b-2 p-[12px]"
          style={{ borderColor: imageBorderColor }}
        >
          <img alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" src={imageUrl ?? PLACEHOLDER_IMAGE} />
          <div className={`relative grid size-[36px] place-items-center rounded-[4px] border-2 text-[20px] font-black leading-[1.2] tracking-[0.2px] ${badgeClass}`}>
            {index + 1}
          </div>
        </div>

        <div className={`relative flex h-[134px] w-full flex-col gap-[10px] p-[12px] ${isCompleted ? 'bg-[#fbae17]' : 'bg-white'}`}>
          <div className="flex w-full flex-col gap-[10px]">
            <div className="h-[36px] min-w-0">
              <h2 className={`m-0 truncate text-[16px] font-bold leading-[1.1] tracking-[0.24px] ${isCompleted ? 'text-white' : 'text-[#3f3f46]'}`}>
                {title}
              </h2>
            </div>

            <div className={`h-[10px] w-full overflow-hidden rounded-[4.286px] ${isCompleted ? 'bg-transparent' : 'bg-[#f4f4f5]'}`}>
              {!isCompleted && !isUnavailable && (
                <span
                  className="kresco-progress-fill block h-full rounded-[4.286px] bg-[#5b60f9] shadow-[inset_0px_2.857px_2.857px_rgba(255,255,255,.4),inset_0px_-2.857px_2.857px_rgba(0,0,0,.08)]"
                  style={{ width: `${progressWidth}px` }}
                />
              )}
            </div>
          </div>

          <span
            className={`flex h-[44px] w-full items-center justify-center rounded-[12px] px-[34px] py-[11px] text-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white transition duration-200 group-hover:brightness-[1.03] group-hover:saturate-[1.08] ${
              isCompleted ? 'bg-[#f5900b]' : isLocked ? 'bg-[#a1a1aa]' : isUpcoming ? 'bg-[#d4d4d8] text-[#71717b]' : 'bg-[#5b60f9]'
            }`}
          >
            {label}
          </span>

          {isCompleted && <div className="absolute right-0 top-0 h-[116px] w-[146px] mix-blend-soft-light opacity-35 [background:linear-gradient(108deg,transparent_0_45%,rgba(255,255,255,.42)_45%_56%,transparent_56%)]" />}
        </div>
      </div>

      {description && <p className="sr-only">{description}</p>}
    </article>
  )

  if (onClick) {
    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onClick()
      }
    }

    return (
      <div
        className="block w-full max-w-[344.33px] cursor-pointer no-underline transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {card}
      </div>
    )
  }

  if (!href || isUnavailable) return card

  return (
    <Link className="block w-full max-w-[344.33px] no-underline transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20" href={href}>
      {card}
    </Link>
  )
}
