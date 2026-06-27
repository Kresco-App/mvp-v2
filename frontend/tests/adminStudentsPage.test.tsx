// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminStudentsPage from '@/app/admin/students/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockImplementation((url: string) => (
    url.startsWith('/admin/xp-audit')
      ? Promise.resolve(xpAuditFixture)
      : Promise.resolve(progressFixture)
  ))
  mocks.postJson.mockResolvedValue({
    transaction_id: 99,
    user_id: 1,
    amount: 50,
    requested_amount: 50,
    reason: 'admin_adjustment',
    description: 'Manual score adjustment',
    idempotency_key: 'admin-xp:1:test',
    actor_user_id: 7,
    total_xp: 950,
    created_at: '2026-06-20T10:05:00Z',
  })
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('AdminStudentsPage', () => {
  it('renders student health summary and searchable rows', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Student health')
      expect(container.textContent).toContain('70%')
      expect(container.textContent).toContain('75%')
      expect(container.textContent).toContain('Sara Benali')
      expect(container.textContent).toContain('Youssef El Idrissi')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/student-progress?limit=100')
      expect(container.textContent).toContain('Learning health')
      expect(container.textContent).toContain('Attention queue')
      expect(container.textContent).toContain('No progress')
      expect(container.textContent).toContain('Zero XP')
      expect(container.textContent).toContain('XP adjustments')
    })

    setInputValue(container, 'input[aria-label="Search students"]', 'Youssef')

    await waitFor(() => {
      expect(container.querySelector('tbody')?.textContent).not.toContain('Sara Benali')
      expect(container.textContent).toContain('Youssef El Idrissi')
      expect(container.textContent).toContain('Students')
    })
  })

  it('loads XP check and submits a student XP adjustment', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('XP adjustments')
      expect(container.textContent).toContain('manual adjustment')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/xp-audit?user_id=1&limit=8')
    })

    setInputValue(container, 'input[aria-label="XP adjustment amount"]', '50')
    setInputValue(container, 'input[aria-label="XP adjustment reason"]', 'Manual score adjustment')
    clickButton(container, 'Apply adjustment')

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith('/admin/xp-adjustments', expect.objectContaining({
        user_id: 1,
        amount: 50,
        reason: 'Manual score adjustment',
      }))
      expect(container.textContent).toContain('XP updated to 950.')
      expect(container.textContent).toContain('Balanced')
    })
  })

  it('hydrates search and selected student from account context URL', async () => {
    window.history.replaceState(null, '', '/admin/students?student_id=2&q=youssef%40example.com')
    const { container } = renderPage()

    await waitFor(() => {
      const searchInput = container.querySelector<HTMLInputElement>('input[placeholder="Search a student"]')
      const selectedStudent = container.querySelector<HTMLSelectElement>('select[aria-label="Select student for XP adjustment"]')
      expect(searchInput?.value).toBe('youssef@example.com')
      expect(selectedStudent?.value).toBe('2')
      expect(container.querySelector('tbody')?.textContent).toContain('Youssef El Idrissi')
      expect(container.querySelector('tbody')?.textContent).not.toContain('Sara Benali')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/xp-audit?user_id=2&limit=8')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminStudentsPage))
  })

  return { container, root }
}

function setInputValue(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`input not found: ${selector}`)
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label))
  if (!button) throw new Error(`button not found: ${label}`)
  act(() => {
    button.click()
  })
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}

const progressFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  summary: {
    total_students: 10,
    active_students_7d: 4,
    students_with_progress: 7,
    completed_topic_items: 12,
    total_watch_minutes: 300,
    quiz_attempts: 8,
    quiz_passed: 6,
    total_xp: 1200,
  },
  progress_by_status: {
    completed: 12,
    started: 5,
  },
  students: [
    {
      user_id: 1,
      full_name: 'Sara Benali',
      email: 'sara@example.com',
      tier: 'vip',
      niveau: '2BAC',
      filiere: 'SM',
      is_pro: true,
      total_xp: 900,
      streak_days: 6,
      progress_records: 8,
      completed_items: 5,
      in_progress_items: 3,
      watched_minutes: 140,
      quiz_attempts: 5,
      quiz_passed: 4,
      average_quiz_score: 82,
      last_activity_at: '2026-06-20T09:00:00Z',
    },
    {
      user_id: 2,
      full_name: 'Youssef El Idrissi',
      email: 'youssef@example.com',
      tier: 'basic',
      niveau: '2BAC',
      filiere: 'PC',
      is_pro: false,
      total_xp: 0,
      streak_days: 0,
      progress_records: 0,
      completed_items: 0,
      in_progress_items: 0,
      watched_minutes: 0,
      quiz_attempts: 0,
      quiz_passed: 0,
      average_quiz_score: 0,
      last_activity_at: null,
    },
  ],
}

const xpAuditFixture = {
  user_id: 1,
  stored_total_xp: 900,
  transaction_sum_xp: 900,
  delta_xp: 0,
  transaction_count: 2,
  adjustment_count: 1,
  adjustment_sum_xp: 50,
  capped_amount_xp: 0,
  has_total_mismatch: false,
  reason_breakdown: [
    {
      reason: 'admin_adjustment',
      count: 1,
      amount: 50,
      requested_amount: 50,
    },
  ],
  transactions: [
    {
      transaction_id: 80,
      user_id: 1,
      amount: 50,
      requested_amount: 50,
      reason: 'admin_adjustment',
      description: 'manual adjustment',
      subject_id: null,
      topic_id: null,
      topic_section_id: null,
      topic_item_id: null,
      question_set_id: null,
      question_id: null,
      quiz_attempt_id: null,
      question_attempt_id: null,
      idempotency_key: 'xp-audit:1',
      daily_cap_category: null,
      daily_cap_date: null,
      cap_applied: false,
      created_at: '2026-06-20T08:00:00Z',
    },
  ],
}
