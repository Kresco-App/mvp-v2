export function FigmaProgressBar({
  value,
  tone,
  size = tone === 'orange' ? 'compact' : 'default',
}: {
  value: number
  tone: 'purple' | 'orange'
  size?: 'compact' | 'default' | 'course'
}) {
  const safeValue = Math.max(0, Math.min(100, value))
  const shellClass = size === 'compact'
    ? 'h-2 rounded-full bg-[#eceef2]'
    : size === 'course'
      ? 'h-[7px] rounded-[4px] bg-[#f0f0f1]'
      : 'h-5 rounded-[5px] bg-[#f0f0f1]'

  return (
    <span className={`${shellClass} block w-full overflow-hidden`}>
      <b className={`${tone === 'orange' ? 'bg-[#ffb31a]' : 'bg-[#3d32d8]'} kresco-progress-fill block h-full rounded-[inherit] ${progressWidthClass(safeValue)}`} />
    </span>
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
