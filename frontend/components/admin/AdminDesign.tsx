'use client'

import { type ReactNode } from 'react'
import { Loader2, RotateCcw, Search, type LucideIcon } from 'lucide-react'

export const adminPageClass = 'mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width)] py-7 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]'
export const adminPanelClass = 'rounded-[22px] border border-[#e5e7eb] bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
export const adminSubtlePanelClass = 'rounded-[18px] border border-[#eef0f4] bg-[#fbfbfc]'
export const adminButtonClass = 'inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#dfe3ea] bg-white px-4 text-[13px] font-black text-[#445066] transition hover:border-[#5b60f9] hover:text-[#3a2fd3] disabled:cursor-not-allowed disabled:opacity-60'
export const adminInputShellClass = 'flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-[#dfe3ea] bg-white px-3 transition focus-within:border-[#5b60f9] focus-within:ring-2 focus-within:ring-[#5b60f9]/10'
export const adminMetricStripThreeClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-3`
export const adminMetricStripClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4`
export const adminMetricStripFiveClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-5`
export const adminMetricTileClass = 'min-h-[112px] border-b border-[#eef0f4] p-4 sm:border-r xl:border-b-0 last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0'

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
    <header className="mb-6 flex flex-col gap-4 border-b border-[#eef0f4] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#eef0ff] text-[#4f46e5]">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[12px] font-black uppercase tracking-[0.08em] text-[#8b93a3]">{eyebrow}</p>
          <h1 className="m-0 mt-1 text-[25px] font-black leading-tight text-[#202633]">{title}</h1>
          <p className="m-0 mt-1 max-w-[820px] text-[14px] font-semibold leading-6 text-[#747d8f]">{description}</p>
          {syncLabel && <p className="m-0 mt-1 text-[12px] font-bold text-[#a8afbd]">{syncLabel}</p>}
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
        <div className="flex flex-col gap-3 border-b border-[#eef0f4] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            {title && <h2 className="m-0 text-[16px] font-black text-[#202633]">{title}</h2>}
            {subtitle && <p className="m-0 mt-1 text-[13px] font-semibold leading-5 text-[#8b93a3]">{subtitle}</p>}
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
      <Search size={15} className="shrink-0 text-[#9aa3b2]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[#202633] outline-none placeholder:text-[#a8afbd]"
      />
    </label>
  )
}
