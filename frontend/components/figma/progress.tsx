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
      <b className={`${tone === 'orange' ? 'bg-[#ffb31a]' : 'bg-[#3d32d8]'} kresco-progress-fill block h-full rounded-[inherit]`} style={{ width: `${safeValue}%` }} />
    </span>
  )
}
