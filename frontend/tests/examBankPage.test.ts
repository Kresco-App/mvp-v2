// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const searchParams = new URLSearchParams('q=waves')

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  routerReplace: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/exam-bank',
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => searchParams,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.apiGet,
}))

vi.mock('@/components/figma', () => ({
  SkeletonBlock: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props),
}))

import ExamBankPage from '@/app/(dashboard)/exam-bank/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  searchParams.delete('q')
  searchParams.set('q', 'waves')
  mocks.apiGet.mockResolvedValue([examResult()])
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
  vi.useRealTimers()
})

describe('exam bank page', () => {
  it('hydrates search state from the URL and syncs query updates back to the router', async () => {
    const { container } = renderExamBankPage()

    await act(async () => {
      await flushPromises()
    })

    const input = container.querySelector('input[aria-label="Search exam bank"]') as HTMLInputElement | null
    expect(input?.value).toBe('waves')
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/exam-bank?q=waves')

    await act(async () => {
      setInputValue(input!, 'limits')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
      vi.advanceTimersByTime(280)
      await flushPromises()
    })

    expect(mocks.routerReplace).toHaveBeenCalledWith('/exam-bank?q=limits', { scroll: false })
    expect(mocks.apiGet).toHaveBeenLastCalledWith('/courses/exam-bank?q=limits')
  })
})

function renderExamBankPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(ExamBankPage))
  })

  return { container, root }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function examResult() {
  return {
    id: 1,
    subject_id: 2,
    subject_title: 'Mathematics',
    title: '2024 Exam',
    year: 2024,
    session: 'Main',
    statement_url: '/statements/1.pdf',
    problems: [
      {
        id: 11,
        title: 'Problem 1',
        statement: 'Solve it.',
        written_solution: '',
        written_solution_url: '',
        difficulty: 'Medium',
        concept_slugs: ['algebra'],
      },
    ],
  }
}
