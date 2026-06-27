'use client'

import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, type LucideIcon } from 'lucide-react'
import { useDropdownTransition } from '@/hooks/useDropdownTransition'

export const adminPageClass = 'mx-auto w-[calc(100%-2rem)] max-w-[var(--figma-shell-width,1180px)] py-7 sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)]'
export const adminPanelClass = 'rounded-[22px] border border-transparent bg-[color:var(--surface-card)] shadow-[var(--shadow-border),0_8px_26px_rgba(24,24,27,0.045)]'
export const adminPanelHeaderClass = 'flex flex-col gap-3 border-b border-[color:var(--border)] px-5 py-4 lg:flex-row lg:items-start lg:justify-between'
export const adminSubtlePanelClass = 'rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-page)]'
export const adminMotionSafeClass = 'motion-reduce:transition-none motion-reduce:active:scale-100'
export const adminSpinnerClass = 'animate-spin motion-reduce:animate-none'
export const adminButtonClass = `inline-flex h-10 items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-4 text-[13px] font-black text-[color:var(--text-secondary)] transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${adminMotionSafeClass}`
export const adminPrimaryButtonClass = `inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[color:var(--primary)] px-4 text-[13px] font-black text-white transition-[background-color,box-shadow,opacity,transform] duration-150 ease-out hover:bg-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 ${adminMotionSafeClass}`
export const adminInputShellClass = 'flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-3 transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-within:border-[color:var(--primary)] focus-within:ring-4 focus-within:ring-[color:var(--primary-soft)] motion-reduce:transition-none'
export const adminMonthInputClass = 'h-10 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-3 text-[13px] font-bold text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-[color:var(--primary)] focus:ring-4 focus:ring-[color:var(--primary-soft)] motion-reduce:transition-none'
export const adminMonthPickerClass = 'relative inline-flex h-11 min-w-[278px] select-none items-center overflow-visible rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-card)] text-[13px] font-black text-[color:var(--text-primary)] shadow-[var(--shadow-border)] transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:border-[color:var(--primary)] hover:shadow-[var(--shadow-border-hover)] focus-within:border-[color:var(--primary)] focus-within:ring-4 focus-within:ring-[color:var(--primary-soft)] motion-reduce:transition-none'
export const adminDatePickerClass = `group relative inline-flex min-h-12 w-full cursor-pointer select-none items-center gap-3 overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-4 text-[14px] font-black text-[color:var(--text-primary)] shadow-[var(--shadow-border)] transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] focus-within:border-[color:var(--primary)] focus-within:ring-4 focus-within:ring-[color:var(--primary-soft)] active:scale-[0.96] ${adminMotionSafeClass}`
export const adminMetricStripThreeClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-3`
export const adminMetricStripClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4`
export const adminMetricStripFiveClass = `${adminPanelClass} mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-5`
export const adminMetricTileClass = 'min-h-[112px] border-b border-[color:var(--border)] p-4 tabular-nums sm:border-r xl:border-b-0 last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0'
export const adminTableScrollClass = 'overflow-x-auto'
export const adminTableClass = 'w-full border-collapse text-left'
export const adminTableHeadClass = 'border-b border-[color:var(--border)] bg-[color:var(--surface-card)]'
export const adminTableHeadRowClass = 'text-[11px] font-black uppercase tracking-[0.04em] text-[color:var(--text-tertiary)]'
export const adminTableHeadCellClass = 'px-5 py-3'
export const adminTableRowClass = 'border-b border-[color:var(--border)] text-[13px] font-bold text-[color:var(--text-secondary)] transition-[background-color] duration-150 ease-out last:border-b-0 hover:bg-[color:var(--surface-page)] motion-reduce:transition-none'
export const adminTableCellClass = 'px-5 py-3 align-middle'
export const adminTableActionButtonClass = `inline-flex h-9 items-center justify-center gap-1.5 rounded-full border bg-white px-3.5 text-[12px] font-black transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.96] disabled:active:scale-100 ${adminMotionSafeClass}`
const adminTableActionToneClass = {
  primary: 'border-[color:var(--primary)] text-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] focus-visible:ring-[color:var(--primary-soft)]',
  success: 'border-[#86efac] text-[#059669] hover:bg-[#ecfdf5] focus-visible:ring-[#dcfce7]',
  danger: 'border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] focus-visible:ring-[#fee2e2]',
} as const

export function AdminPageHeader({
  icon: Icon,
  title,
  syncLabel,
  action,
}: {
  icon: LucideIcon
  title: string
  eyebrow?: string
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
          <h1 className="m-0 text-balance text-[25px] font-black leading-tight text-[color:var(--text-primary)]">{title}</h1>
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
      {loading ? <Loader2 size={15} className={adminSpinnerClass} /> : <RotateCcw size={15} aria-hidden="true" />}
      {label}
    </button>
  )
}

export function AdminMonthPicker({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const {
    closeDropdown,
    dropdownStateClassName,
    isOpen: open,
    openDropdown,
    shouldRenderDropdown,
  } = useDropdownTransition()
  const [viewMonth, setViewMonth] = useState(() => normalizeAdminMonthValue(value))
  const popoverId = `admin-month-picker-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const selected = normalizeAdminMonthValue(value)
  const selectedDate = adminMonthToDate(selected)
  const viewDate = adminMonthToDate(viewMonth)
  const currentMonth = getCurrentAdminMonth()
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const monthValue = adminMonthString(viewDate.getUTCFullYear(), index)
    return {
      label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(Date.UTC(viewDate.getUTCFullYear(), index, 1))),
      value: monthValue,
      selected: monthValue === selected,
      current: monthValue === currentMonth,
    }
  })

  useEffect(() => {
    if (!open) setViewMonth(selected)
  }, [open, selected])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current
      if (!root || root.contains(event.target as Node)) return
      closeDropdown()
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') closeDropdown()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDropdown, open])

  function commitMonth(nextMonth: string) {
    onChange(nextMonth)
    closeDropdown()
    triggerRef.current?.focus()
  }

  function stepMonth(delta: number) {
    commitMonth(addAdminMonths(selectedDate, delta))
  }

  function stepYear(delta: number) {
    setViewMonth(adminMonthString(viewDate.getUTCFullYear() + delta, viewDate.getUTCMonth()))
  }

  function openPicker() {
    if (open) {
      closeDropdown()
      return
    }

    setViewMonth(selected)
    openDropdown()
  }

  function handleMonthButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>, monthValue: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    commitMonth(monthValue)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      stepMonth(-1)
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      stepMonth(1)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setViewMonth(selected)
      openDropdown()
    }
  }

  return (
    <span ref={rootRef} className={`${adminMonthPickerClass} ${className}`}>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => stepMonth(-1)}
        className={`grid h-full w-11 shrink-0 place-items-center rounded-l-[13px] border-0 bg-transparent text-[color:var(--text-tertiary)] outline-none transition-[background-color,color,transform] duration-150 ease-out hover:bg-[color:var(--surface-page)] hover:text-[color:var(--primary)] focus-visible:bg-[color:var(--primary-soft)] focus-visible:text-[color:var(--primary)] active:scale-[0.96] ${adminMotionSafeClass}`}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={shouldRenderDropdown ? popoverId : undefined}
        onClick={openPicker}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 border-x border-[color:var(--border)] bg-transparent px-3 text-left text-[13px] font-black text-inherit outline-none transition-[background-color,color] duration-150 ease-out hover:bg-[color:var(--surface-page)] hover:text-[color:var(--primary)] focus-visible:bg-[color:var(--primary-soft)] focus-visible:text-[color:var(--primary)] motion-reduce:transition-none"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
          <CalendarDays size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 whitespace-nowrap tabular-nums">{formatAdminMonthPickerLabel(value)}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[color:var(--text-tertiary)] transition-[color,transform] duration-150 ease-out motion-reduce:transition-none ${open ? 'rotate-180 text-[color:var(--primary)]' : ''}`}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        aria-label="Next month"
        onClick={() => stepMonth(1)}
        className={`grid h-full w-11 shrink-0 place-items-center rounded-r-[13px] border-0 bg-transparent text-[color:var(--text-tertiary)] outline-none transition-[background-color,color,transform] duration-150 ease-out hover:bg-[color:var(--surface-page)] hover:text-[color:var(--primary)] focus-visible:bg-[color:var(--primary-soft)] focus-visible:text-[color:var(--primary)] active:scale-[0.96] ${adminMotionSafeClass}`}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      {shouldRenderDropdown && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={label}
          data-origin="top-right"
          className={`t-dropdown absolute right-0 top-[calc(100%+10px)] z-50 w-[318px] rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-card)] p-3 text-[color:var(--text-primary)] shadow-[0_18px_44px_rgba(24,24,27,0.16),var(--shadow-border)] ${dropdownStateClassName}`}
        >
          <div className="mb-2 grid h-10 grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => stepYear(-1)}
              className={`grid h-9 w-9 place-items-center rounded-[10px] border border-transparent text-[color:var(--text-tertiary)] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--border)] hover:bg-[color:var(--surface-page)] hover:text-[color:var(--primary)] active:scale-[0.96] ${adminMotionSafeClass}`}
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <span className="min-w-0 text-center text-[14px] font-black tabular-nums">{viewDate.getUTCFullYear()}</span>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => stepYear(1)}
              className={`grid h-9 w-9 place-items-center rounded-[10px] border border-transparent text-[color:var(--text-tertiary)] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--border)] hover:bg-[color:var(--surface-page)] hover:text-[color:var(--primary)] active:scale-[0.96] ${adminMotionSafeClass}`}
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {monthOptions.map((month) => (
              <button
                type="button"
                key={month.value}
                aria-pressed={month.selected}
                onClick={() => commitMonth(month.value)}
                onKeyDown={(event) => handleMonthButtonKeyDown(event, month.value)}
                className={`relative h-11 rounded-[12px] border text-[12px] font-black tabular-nums transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] ${adminMotionSafeClass} ${
                  month.selected
                    ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-white shadow-[0_8px_18px_rgba(69,61,238,0.2)]'
                    : 'border-transparent bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--border)] hover:bg-[color:var(--surface-page)] hover:text-[color:var(--text-primary)]'
                }`}
              >
                {month.label}
                {month.selected && <Check size={12} className="absolute right-1.5 top-1.5" aria-hidden="true" />}
                {month.current && !month.selected && <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[color:var(--primary)]" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-[color:var(--border)] pt-2">
            <button
              type="button"
              onClick={() => commitMonth(currentMonth)}
              disabled={selected === currentMonth}
              className={`flex h-10 w-full items-center justify-center rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-page)] text-[12px] font-black text-[color:var(--text-secondary)] transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:cursor-default disabled:opacity-55 disabled:active:scale-100 ${adminMotionSafeClass}`}
            >
              Current month
            </button>
          </div>
        </div>
      )}
    </span>
  )
}

export function AdminDatePicker({
  value,
  onChange,
  label,
  name,
  required,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  label: string
  name?: string
  required?: boolean
  className?: string
}) {
  return (
    <span className={`${adminDatePickerClass} ${className}`}>
      <span className="pointer-events-none grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
        <CalendarDays size={16} aria-hidden="true" />
      </span>
      <span className="pointer-events-none min-w-0 flex-1 whitespace-nowrap tabular-nums">{formatAdminDatePickerLabel(value)}</span>
      <ChevronDown size={15} className="pointer-events-none shrink-0 text-[color:var(--text-tertiary)] transition-[color] duration-150 ease-out group-hover:text-[color:var(--primary)]" aria-hidden="true" />
      <input
        aria-label={label}
        name={name}
        required={required}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:light]"
      />
    </span>
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
      {(title || actions) && (
        <div className={adminPanelHeaderClass}>
          <div>
            {title && <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      <div className={title || actions ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function formatAdminMonthPickerLabel(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return value.trim() || 'Select month'
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return value
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthIndex, 1)))
}

function getCurrentAdminMonth() {
  const now = new Date()
  return adminMonthString(now.getFullYear(), now.getMonth())
}

function normalizeAdminMonthValue(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return getCurrentAdminMonth()
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return getCurrentAdminMonth()
  return adminMonthString(year, monthIndex)
}

function adminMonthToDate(value: string) {
  const normalized = normalizeAdminMonthValue(value)
  const [year, month] = normalized.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

function adminMonthString(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function addAdminMonths(date: Date, delta: number) {
  return adminMonthString(date.getUTCFullYear(), date.getUTCMonth() + delta)
}

export function formatAdminDatePickerLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value.trim() || 'Select date'
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return value
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.UTC(year, monthIndex, day)))
}

export function AdminTable({
  children,
  minWidthClass = 'min-w-[760px]',
  className = '',
}: {
  children: ReactNode
  minWidthClass?: string
  className?: string
}) {
  return (
    <div className={adminTableScrollClass}>
      <table className={`${adminTableClass} ${minWidthClass} ${className}`}>{children}</table>
    </div>
  )
}

export function AdminTableActionButton({
  children,
  className = '',
  tone = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  tone?: keyof typeof adminTableActionToneClass
}) {
  return (
    <button
      type={type}
      className={`${adminTableActionButtonClass} ${adminTableActionToneClass[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
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
      <Search size={15} className="shrink-0 text-[color:var(--text-tertiary)]" aria-hidden="true" />
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

export function AdminProgressBar({
  value,
  max = 100,
  tone = 'primary',
  className = '',
}: {
  value: number
  max?: number
  tone?: 'primary' | 'warn'
  className?: string
}) {
  const normalized = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const fillClass = tone === 'warn' ? 'bg-[#f59e0b]' : 'bg-[color:var(--primary)]'

  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-page)] ${className}`} aria-hidden="true">
      <span
        className={`block h-full rounded-full transition-[background-color,width] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${fillClass}`}
        style={{ width: `${normalized}%` }}
      />
    </div>
  )
}
