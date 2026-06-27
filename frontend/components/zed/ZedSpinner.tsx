import { Loader2 } from 'lucide-react'

export default function ZedSpinner({
  className = '',
  iconClassName = '',
  size = 16,
}: {
  className?: string
  iconClassName?: string
  size?: number
}) {
  return (
    <span className={`inline-flex animate-spin motion-reduce:animate-none ${className}`} aria-hidden="true">
      <Loader2 size={size} className={iconClassName} />
    </span>
  )
}
