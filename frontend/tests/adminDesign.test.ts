import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  adminDatePickerClass,
  adminMonthInputClass,
  adminMonthPickerClass,
  adminPageClass,
  adminPanelHeaderClass,
  adminPrimaryButtonClass,
  adminTableActionButtonClass,
  adminTableClass,
  adminTableHeadClass,
  adminTableHeadRowClass,
  adminTableRowClass,
  adminTableScrollClass,
  formatAdminDatePickerLabel,
  formatAdminMonthPickerLabel,
} from '@/components/admin/AdminDesign'

function collectSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      return collectSourceFiles(path)
    }

    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : []
  })
}

describe('admin design system contracts', () => {
  it('keeps shared admin pages bounded even outside figma-app wrappers', () => {
    expect(adminPageClass).toContain('max-w-[var(--figma-shell-width,1180px)]')
  })

  it('keeps the BankDash table pattern available as shared admin primitives', () => {
    expect(adminTableScrollClass).toContain('overflow-x-auto')
    expect(adminTableClass).toContain('border-collapse')
    expect(adminTableHeadClass).toContain('border-b border-[color:var(--border)]')
    expect(adminTableHeadRowClass).toContain('uppercase')
    expect(adminTableRowClass).toContain('hover:bg-[color:var(--surface-page)]')
    expect(adminTableActionButtonClass).toContain('rounded-full')
    expect(adminTableActionButtonClass).toContain('border')
  })

  it('keeps common admin controls tokenized to the Kresco theme', () => {
    const designSource = readFileSync(join(process.cwd(), 'components', 'admin', 'AdminDesign.tsx'), 'utf8')

    expect(adminPrimaryButtonClass).toContain('bg-[color:var(--primary)]')
    expect(adminPrimaryButtonClass).toContain('hover:bg-[color:var(--primary)]')
    expect(adminMonthInputClass).toContain('focus:border-[color:var(--primary)]')
    expect(adminMonthInputClass).toContain('focus:ring-[color:var(--primary-soft)]')
    expect(adminMonthPickerClass).toContain('h-11')
    expect(adminMonthPickerClass).toContain('min-w-[278px]')
    expect(adminMonthPickerClass).toContain('hover:border-[color:var(--primary)]')
    expect(adminMonthPickerClass).toContain('focus-within:ring-4')
    expect(designSource).toContain('active:scale-[0.96]')
    expect(adminDatePickerClass).toContain('min-h-12')
    expect(adminDatePickerClass).toContain('w-full')
    expect(adminDatePickerClass).toContain('active:scale-[0.96]')
    expect(adminPanelHeaderClass).toContain('border-[color:var(--border)]')
  })

  it('formats the shared admin month picker as custom dashboard chrome', () => {
    const designSource = readFileSync(join(process.cwd(), 'components', 'admin', 'AdminDesign.tsx'), 'utf8')

    expect(formatAdminMonthPickerLabel('2026-06')).toBe('June 2026')
    expect(formatAdminMonthPickerLabel('')).toBe('Select month')
    expect(designSource).toContain('function AdminMonthPicker')
    expect(designSource).toContain('aria-haspopup="dialog"')
    expect(designSource).toContain('Previous month')
    expect(designSource).toContain('Next month')
    expect(designSource).toContain('handleTriggerKeyDown')
    expect(designSource).toContain('ArrowLeft')
    expect(designSource).toContain('ArrowRight')
    expect(designSource).toContain('ArrowDown')
    expect(designSource).toContain('role="dialog"')
    expect(designSource).toContain('grid grid-cols-3')
    expect(designSource).toContain('Current month')
    expect(designSource).not.toContain('type="month"')
  })

  it('keeps the shared admin date picker large enough for form use', () => {
    const designSource = readFileSync(join(process.cwd(), 'components', 'admin', 'AdminDesign.tsx'), 'utf8')
    const financeSource = readFileSync(join(process.cwd(), 'app', 'admin', 'finance', 'page.tsx'), 'utf8')

    expect(formatAdminDatePickerLabel('2026-06-25')).toBe('06/25/2026')
    expect(formatAdminDatePickerLabel('')).toBe('Select date')
    expect(designSource).toContain('function AdminDatePicker')
    expect(designSource).toContain('type="date"')
    expect(designSource).toContain('min-h-12 w-full')
    expect(designSource).toContain('absolute inset-0 h-full w-full cursor-pointer opacity-0')
    expect(designSource).not.toContain('tabIndex={-1}')
    expect(financeSource).toContain('AdminDatePicker')
    expect(financeSource).toContain('className="col-span-2"')
  })

  it('keeps shared admin page headers free of low-signal eyebrow text', () => {
    const designSource = readFileSync(join(process.cwd(), 'components', 'admin', 'AdminDesign.tsx'), 'utf8')

    expect(designSource).toContain('eyebrow?: string')
    expect(designSource).not.toContain('uppercase tracking-[0.08em]')
    expect(designSource).not.toContain('{eyebrow}</p>')
  })


  it('uses explicit themed progress bars instead of native browser progress controls', () => {
    const designSource = readFileSync(join(process.cwd(), 'components', 'admin', 'AdminDesign.tsx'), 'utf8')
    const sourcePaths = [
      ...collectSourceFiles(join(process.cwd(), 'app', 'admin')),
      ...collectSourceFiles(join(process.cwd(), 'components', 'admin')),
    ]

    expect(designSource).toContain('function AdminProgressBar')
    expect(designSource).toContain('bg-[color:var(--primary)]')
    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).not.toContain('<progress')
    }
  })

  it('uses Kresco theme tokens for founder dashboard charts', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'admin', 'FounderCharts.tsx'), 'utf8')

    expect(source).toContain("const krescoChartColor = 'var(--primary, #453dee)'")
    expect(source).not.toContain('#2563eb')
  })

  it('keeps admin navigation routed through the sidebar shell', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'app', 'admin', 'layout.tsx'), 'utf8')

    expect(layoutSource).toContain("import AdminShell from '@/components/admin/AdminShell'")
    expect(layoutSource).toContain('<AdminShell>')
    expect(existsSync(join(process.cwd(), 'components', 'admin', 'AdminTopNav.tsx'))).toBe(false)
  })

  it('keeps the most visible admin dashboard accents tokenized', () => {
    for (const sourcePath of [
      join(process.cwd(), 'components', 'admin', 'AdminShell.tsx'),
      join(process.cwd(), 'components', 'admin', 'ChangeReviewBoard.tsx'),
      join(process.cwd(), 'app', 'admin', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'finance', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'students', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'users', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'activity', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'statistics', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', 'page.tsx'),
    ]) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).toContain('var(--primary')
      expect(source, sourcePath).not.toContain('#2563eb')
      expect(source, sourcePath).not.toContain('#1d4ed8')
      expect(source, sourcePath).not.toContain('#5b60f9')
      expect(source, sourcePath).not.toContain('#3a2fd3')
      expect(source, sourcePath).not.toContain('#f0f0ff')
      expect(source, sourcePath).not.toContain('#3b32c8')
    }
  })

  it('keeps legacy BankDash blue literals out of admin source', () => {
    const sourcePaths = [
      ...collectSourceFiles(join(process.cwd(), 'app', 'admin')),
      ...collectSourceFiles(join(process.cwd(), 'components', 'admin')),
    ]

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).not.toContain('#2563eb')
      expect(source, sourcePath).not.toContain('#1d4ed8')
      expect(source, sourcePath).not.toContain('#5b60f9')
      expect(source, sourcePath).not.toContain('#4b50e8')
      expect(source, sourcePath).not.toContain('#3a2fd3')
      expect(source, sourcePath).not.toContain('#f0f0ff')
      expect(source, sourcePath).not.toContain('#3b32c8')
      expect(source, sourcePath).not.toContain('#123288')
      expect(source, sourcePath).not.toContain('#1814f3')
      expect(source, sourcePath).not.toContain('#718ebf')
    }
  })

  it('uses shared page/control primitives on the founder overview and finance pages', () => {
    for (const sourcePath of [
      join(process.cwd(), 'app', 'admin', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'finance', 'page.tsx'),
    ]) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).toContain('AdminPageHeader')
      expect(source, sourcePath).toContain('adminPageClass')
      expect(source, sourcePath).toContain('AdminMonthPicker')
      expect(source, sourcePath).toContain('adminPrimaryButtonClass')
      expect(source, sourcePath).not.toContain('type="month"')
    }
  })

  it('uses the shared primary action primitive instead of local primary button strings', () => {
    for (const sourcePath of [
      join(process.cwd(), 'app', 'admin', 'communications', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', '[subjectId]', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', 'activities', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', 'content', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'courses', 'new', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'students', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'users', 'page.tsx'),
      join(process.cwd(), 'components', 'admin', 'ChangeReviewBoard.tsx'),
    ]) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).toContain('adminPrimaryButtonClass')
      expect(source, sourcePath).not.toContain("const primaryButton = '")
      expect(source, sourcePath).not.toContain('inline-flex h-10 items-center gap-2 rounded-[12px] bg-[color:var(--primary)]')
      expect(source, sourcePath).not.toContain('inline-flex h-11 items-center gap-2 rounded-[12px] bg-[color:var(--primary)]')
      expect(source, sourcePath).not.toContain('flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[color:var(--primary)]')
    }
  })

  it('uses the shared BankDash-style table primitive on core operator tables', () => {
    for (const sourcePath of [
      join(process.cwd(), 'app', 'admin', 'students', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'users', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'finance', 'page.tsx'),
    ]) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).toContain('AdminTable')
      expect(source, sourcePath).toContain('adminTableHeadClass')
      expect(source, sourcePath).toContain('adminTableRowClass')
      expect(source, sourcePath).not.toContain('className="overflow-x-auto"')
      expect(source, sourcePath).not.toContain('border-collapse text-left')
    }
  })

  it('keeps analytics and audit pages on shared panel chrome', () => {
    for (const sourcePath of [
      join(process.cwd(), 'app', 'admin', 'activity', 'page.tsx'),
      join(process.cwd(), 'app', 'admin', 'statistics', 'page.tsx'),
    ]) {
      const source = readFileSync(sourcePath, 'utf8')

      expect(source, sourcePath).toContain('AdminPanel')
      expect(source, sourcePath).toContain('adminPanelHeaderClass')
      expect(source, sourcePath).not.toContain('border-b border-[#f4f4f5] p-5')
    }
  })

  it('uses the shared BankDash-style action pill on finance table decisions', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'admin', 'finance', 'page.tsx'), 'utf8')

    expect(source).toContain('AdminTableActionButton')
    expect(source).not.toContain('rounded-[10px] bg-[#ecfdf5]')
    expect(source).not.toContain('rounded-[10px] bg-[#fef2f2]')
  })

  it('keeps review operations on shared panel headers and action pills', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'admin', 'ChangeReviewBoard.tsx'), 'utf8')

    expect(source).toContain('adminPanelHeaderClass')
    expect(source).toContain('AdminTableActionButton')
    expect(source).not.toContain('inline-flex items-center gap-1 rounded-[9px]')
  })
})
