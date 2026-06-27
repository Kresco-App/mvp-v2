'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { StudioReadiness, StudioReadinessIssue } from './studioBoardModel'

const readinessIssueMotionClass =
  'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out hover:shadow-[0_10px_24px_rgba(24,24,27,0.08)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100'

export default function StudioReadinessSummary({
  readiness,
  onIssueSelect,
}: {
  readiness: StudioReadiness
  onIssueSelect: (issue: StudioReadinessIssue) => void
}) {
  const statusText = readiness.blockers.length > 0
    ? `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? '' : 's'}`
    : readiness.warnings.length > 0
      ? `${readiness.warnings.length} warning${readiness.warnings.length === 1 ? '' : 's'}`
      : 'Ready to submit'
  const summaryTone = readiness.blockers.length > 0
    ? 'bg-[#fff7ed] text-[#9a3412]'
    : readiness.warnings.length > 0
      ? 'bg-[#fffbeb] text-[#854d0e]'
      : 'bg-[#f0fdf4] text-[#166534]'
  const Icon = readiness.blockers.length > 0 || readiness.warnings.length > 0 ? AlertTriangle : CheckCircle2
  const visibleIssues = [...readiness.blockers, ...readiness.warnings].slice(0, 2)

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="Studio readiness summary">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${summaryTone}`}>
        <Icon size={13} />
        {statusText}
      </span>
      {visibleIssues.length > 0 && (
        <>
          {visibleIssues.map((issue) => <StudioReadinessIssueCard key={issue.key} issue={issue} onSelect={onIssueSelect} />)}
        </>
      )}
    </div>
  )
}

function StudioReadinessIssueCard({
  issue,
  onSelect,
}: {
  issue: StudioReadinessIssue
  onSelect: (issue: StudioReadinessIssue) => void
}) {
  const toneClass = issue.level === 'blocker'
    ? 'border-[#fed7aa] bg-white text-[#9a3412]'
    : 'border-[#fde68a] bg-white text-[#854d0e]'
  const actionText = issue.target ? 'Open in inspector' : 'Add chapter'

  return (
    <button
      type="button"
      aria-label={`${actionText}: ${issue.label}`}
      onClick={() => onSelect(issue)}
      className={`inline-flex min-h-10 min-w-0 max-w-[260px] items-center gap-2 rounded-full border px-3 py-1 text-left ${readinessIssueMotionClass} ${toneClass}`}
    >
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.08em]">{issue.level}</span>
      <span className="min-w-0 truncate text-[11px] font-bold text-[#3f3f46]">{issue.label}</span>
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-[#52525c]">{actionText}</span>
    </button>
  )
}
