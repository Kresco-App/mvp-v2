import Link from 'next/link'
import Image from 'next/image'

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
  onPreload?: () => void
  state: FigmaSubjectCourseCardState
}

const PLACEHOLDER_IMAGE = '/figma-assets/course-card-placeholder.png'
const cardChromeMotionClass = 'transition-[box-shadow,filter,opacity,transform] duration-150 ease-out group-hover:-translate-y-px group-focus-within:-translate-y-px group-active:translate-y-px motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-focus-within:translate-y-0 motion-reduce:group-active:translate-y-0'
const cardImageMotionClass = 'transition-[transform] duration-150 ease-out group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100'
const cardBadgeMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out group-hover:scale-[1.03] group-hover:shadow-[0_4px_10px_rgba(24,24,27,0.12)] motion-reduce:transition-none motion-reduce:group-hover:scale-100'
const cardActionMotionClass = 'transition-[background-color,color,filter,transform] duration-150 ease-out group-hover:brightness-[1.03] group-hover:saturate-[1.08] group-active:translate-y-px motion-reduce:transition-none motion-reduce:group-active:translate-y-0'

export function FigmaSubjectCourseCard({
  index,
  title,
  description,
  progress,
  href,
  imageUrl,
  onClick,
  onPreload,
  state,
}: FigmaSubjectCourseCardProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))
  const isCompleted = state === 'completed'
  const isCurrent = state === 'current'
  const isLocked = state === 'locked'
  const isUpcoming = state === 'upcoming'
  const isUnavailable = isLocked || isUpcoming
  const label = isCompleted ? 'Done' : isCurrent ? 'Continue' : isLocked ? 'Locked' : isUpcoming ? 'Soon' : 'Start'
  const progressWidthClassName = progressWidthClass(Math.max(8, safeProgress))
  const cardChromeClass = isCompleted
    ? 'bg-[#fcc94d] shadow-[0_3.75px_0_#f5900b] group-hover:shadow-[0_5px_0_#f5900b,0_14px_28px_rgba(245,144,11,0.16)] group-active:shadow-[0_2px_0_#f5900b]'
    : isCurrent
      ? 'bg-[#5b60f9] shadow-[0_3.75px_0_#383dc7] group-hover:shadow-[0_5px_0_#383dc7,0_14px_28px_rgba(91,96,249,0.18)] group-active:shadow-[0_2px_0_#383dc7]'
      : 'bg-[#e4e4e7] shadow-[0_3.75px_0_#d9dadd] group-hover:shadow-[0_5px_0_#d9dadd,0_14px_28px_rgba(24,24,27,0.1)] group-active:shadow-[0_2px_0_#d9dadd]'
  const imageBorderClass = isCompleted ? 'border-[#fcc94d]' : isCurrent ? 'border-[#5b60f9]' : 'border-[#d4d4d8]'
  const badgeClass = isCompleted
    ? 'border-[#fbae17] bg-[#f5900b] text-white'
    : isCurrent
      ? 'border-[#5b60f9] bg-white text-[#5b60f9]'
      : isUnavailable
        ? 'border-[#d4d4d8] bg-[#f4f4f5] text-[#9f9fa9]'
        : 'border-[#d4d4d8] bg-white text-[#71717b]'

  const card = (
    <article
      className={`kresco-enter relative h-[327.5px] w-full max-w-[344.33px] shrink-0 overflow-visible rounded-[16px] p-[2px] ${cardChromeMotionClass} ${cardChromeClass} ${isUnavailable ? 'opacity-80' : ''}`}
    >
      <div
        className={`flex h-full flex-col overflow-hidden rounded-[14px] transition-[background-color] duration-150 ease-out motion-reduce:transition-none ${isCompleted ? 'bg-[#fbae17]' : 'bg-white'}`}
      >
        <div
          className={`relative h-[193.5px] w-full overflow-hidden border-b-2 p-[12px] ${imageBorderClass}`}
        >
          <Image
            alt=""
            className={`kresco-media-outline object-cover ${cardImageMotionClass}`}
            fill
            sizes="(max-width: 768px) 100vw, 344px"
            src={imageUrl ?? PLACEHOLDER_IMAGE}
          />
          <div className={`relative grid size-[36px] place-items-center rounded-[4px] border-2 text-[20px] font-black leading-[1.2] tracking-[0.2px] tabular-nums ${cardBadgeMotionClass} ${badgeClass}`}>
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
                  className={`kresco-progress-fill block h-full rounded-[4.286px] bg-[#5b60f9] shadow-[inset_0px_2.857px_2.857px_rgba(255,255,255,.4),inset_0px_-2.857px_2.857px_rgba(0,0,0,.08)] ${progressWidthClassName}`}
                />
              )}
            </div>
          </div>

          <span
            className={`flex h-[44px] w-full items-center justify-center rounded-[12px] px-[34px] py-[11px] text-center text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-white ${cardActionMotionClass} ${
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
    return (
      <div
        className="group relative block w-full max-w-[344.33px] cursor-pointer no-underline"
        onPointerEnter={onPreload}
        onMouseOver={onPreload}
        onFocusCapture={onPreload}
      >
        {card}
        <button
          type="button"
          className="absolute inset-0 rounded-[16px] border-0 bg-transparent p-0 text-left transition-[box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20 motion-reduce:transition-none"
          onClick={onClick}
        >
          <span className="sr-only">{label}: {title}</span>
        </button>
      </div>
    )
  }

  if (!href || isUnavailable) return card

  return (
    <div
      className="group block w-full max-w-[344.33px] no-underline"
      onFocusCapture={onPreload}
      onPointerEnter={onPreload}
      onMouseOver={onPreload}
    >
      <Link className="block w-full rounded-[16px] no-underline transition-[box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/20 motion-reduce:transition-none" href={href}>
        {card}
      </Link>
    </div>
  )
}

function progressWidthClass(value: number) {
  const bucket = Math.max(0, Math.min(100, Math.round(value / 5) * 5))
  switch (bucket) {
    case 0: return 'w-0'
    case 5: return 'w-[5%]'
    case 10: return 'w-[10%]'
    case 15: return 'w-[15%]'
    case 20: return 'w-[20%]'
    case 25: return 'w-1/4'
    case 30: return 'w-[30%]'
    case 35: return 'w-[35%]'
    case 40: return 'w-[40%]'
    case 45: return 'w-[45%]'
    case 50: return 'w-1/2'
    case 55: return 'w-[55%]'
    case 60: return 'w-[60%]'
    case 65: return 'w-[65%]'
    case 70: return 'w-[70%]'
    case 75: return 'w-3/4'
    case 80: return 'w-4/5'
    case 85: return 'w-[85%]'
    case 90: return 'w-[90%]'
    case 95: return 'w-[95%]'
    default: return 'w-full'
  }
}
