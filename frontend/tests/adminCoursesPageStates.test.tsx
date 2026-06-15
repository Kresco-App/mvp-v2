// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  toastError: vi.fn(),
  useAdminSubjectsData: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock('@/lib/courseDiscoveryData', () => ({
  useAdminSubjectsData: mocks.useAdminSubjectsData,
}))

import AdminCoursesPage from '@/app/admin/courses/page'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
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

describe('AdminCoursesPage cached state rendering', () => {
  it('keeps cached subjects visible when a background refresh has an error', () => {
    mocks.useAdminSubjectsData.mockReturnValue({
      subjects: [{ id: 7, title: 'Math', chapter_count: 3, lesson_count: 9 }],
      loading: false,
      error: { response: { status: 500, data: { detail: 'Background subjects failure' } } },
      retry: vi.fn(),
    })

    const { container } = renderAdminCoursesPage()

    expect(container.textContent).toContain('Math')
    expect(container.textContent).toContain('3 topics / 9 items')
    expect(container.textContent).not.toContain('Background subjects failure')
    expect(mocks.toastError).toHaveBeenCalledWith('Background subjects failure')
  })
})

function renderAdminCoursesPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminCoursesPage))
  })

  return { container, root }
}
