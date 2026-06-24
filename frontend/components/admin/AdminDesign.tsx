'use client'

import { type ReactNode } from 'react'
import { Loader2, RotateCcw, Search, type LucideIcon } from 'lucide-react'

export const adminPageClass = 'mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-7 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]'
export const adminPanelClass = 'rounded-[22px] border border-transparent bg-[color:var(--surface-card)] shadow-[var(--shadow-border),0_8px_26px_rgba(24,24,27,0.045)]'
export const adminSubtlePanelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-page)]'
export const adminButtonClass = 'inline-flex h-10 items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-4 text-[13px] font-black text-[color:var(--text-secondary)] transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'
export const adminInputShellClass = 'flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-3 transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-within:border-[color:var(--primary)] focus-within:ring-4 focus-within:ring-[color:var(--primary-soft)]'
export const adminMetricStripThreeClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-3`
export const adminMetricStripClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4`
export const adminMetricStripFiveClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-5`
export const adminMetricTileClass = 'min-h-[112px] border-b border-[color:var(--border)] p-4 tabular-nums sm:border-r xl:border-b-0 last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0'

export function AdminPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  syncLabel,
  action,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  syncLabel?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-[color:var(--border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[color:var(--primary)]">{eyebrow}</p>
          <h1 className="m-0 mt-1 text-balance text-[25px] font-black leading-tight text-[color:var(--text-primary)]">{title}</h1>
          <p className="m-0 mt-1 max-w-[820px] text-pretty text-[14px] font-semibold leading-6 text-[color:var(--text-hint)]">{description}</p>
          {syncLabel && <p className="m-0 mt-1 text-[12px] font-bold text-[color:var(--text-tertiary)]">{syncLabel}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}

export function AdminRefreshButton({
  loading,
  onClick,
  label = 'Refresh',
}: {
  loading?: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button type="button" onClick={onClick} className={adminButtonClass}>
      {loading ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
      {label}
    </button>
  )
}

export function AdminAlert({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' }) {
  const toneClass = tone === 'danger'
    ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
    : 'border-[#fde68a] bg-[#fffbeb] text-[#92660b]'
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-[16px] border px-4 py-3 text-[13px] font-bold ${toneClass}`}>
      {children}
    </div>
  )
}

export function AdminPanel({
  title,
  subtitle,
  children,
  className = '',
  actions,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  return (
    <section className={`${adminPanelClass} ${className}`}>
      {(title || subtitle || actions) && (
        <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            {title && <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">{title}</h2>}
            {subtitle && <p className="m-0 mt-1 text-[13px] font-semibold leading-5 text-[color:var(--text-hint)]">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={title || subtitle || actions ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function AdminSearchBox({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <label className={`${adminInputShellClass} ${className}`}>
      <Search size={15} className="shrink-0 text-[color:var(--text-tertiary)]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-tertiary)]"
      />
    </label>
  )
}
