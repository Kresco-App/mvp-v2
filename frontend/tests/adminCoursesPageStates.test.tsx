// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  useAdminSubjectsData: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/lib/lazyToast', () => ({
  showToastError: mocks.toastError,
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

vi.mock('@/lib/apiConfig', () => ({
  getBackendUrl: (path: string) => `https://api.example.test${path}`,
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
  mocks.getJson.mockResolvedValue(overviewFixture)
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
    expect(container.textContent).toContain('Derniere actualisation en echec.')
    expect(container.textContent).toContain('Cache')
    expect(container.textContent).toContain('Content readiness')
    expect(container.textContent).not.toContain('Background subjects failure')
    expect(mocks.toastError).toHaveBeenCalledWith('Background subjects failure')
  })

  it('renders a focused empty state with a create-course action', () => {
    mocks.useAdminSubjectsData.mockReturnValue({
      subjects: [],
      loading: false,
      error: null,
      retry: vi.fn(),
    })

    const { container } = renderAdminCoursesPage()

    expect(container.textContent).toContain('Aucun cours trouve.')
    expect(container.textContent).toContain('Publish blockers')
    const createLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find((link) => (
      link.textContent?.includes('Nouveau cours')
    ))
    expect(createLink?.getAttribute('href')).toBe('/admin/courses/new')
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

const overviewFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  totals: {},
  content_status: {
    topics: { published: 3 },
    topic_items: { published: 7, draft: 2 },
  },
  access_billing: {},
  ops_readiness: {
    content_gaps: {
      topics_without_items: 1,
    },
  },
  progress_xp: {},
  exam_bank: {},
  calendar: {},
  engagement: {},
  interactions: {},
  notifications: {},
  finance: {},
  communications: {},
  admin_audit: {},
  crud_catalog: [
    {
      domain: 'knowledge-base',
      slug: 'topic',
      name: 'Topic',
      name_plural: 'Topics',
      model: 'Topic',
      admin_url: '/admin/topic/list',
      actions: { create: true, read: true, update: true, delete: true },
    },
  ],
}
