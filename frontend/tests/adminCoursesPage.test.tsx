// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminCoursesPage from '@/app/admin/courses/page'
import { apiSWRConfig } from '@/lib/apiData'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.apiGet,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

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

describe('AdminCoursesPage shared subject discovery', () => {
  it('loads subjects through the shared SWR key and renders topic/item counts', async () => {
    mocks.apiGet.mockResolvedValue([
      { id: 42, title: 'Physique', chapter_count: 6, lesson_count: 18 },
    ])

    const { container } = renderAdminCoursesPage({
      dedupingInterval: 0,
      errorRetryCount: 0,
      refreshInterval: 1,
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Physique')
      expect(container.textContent).toContain('6 topics / 18 items')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/subjects')
  })

  it('shows API errors once and retries through SWR mutate', async () => {
    let calls = 0
    mocks.apiGet.mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        throw { response: { status: 500, data: { detail: 'Controlled subjects failure' } } }
      }
      return [{ id: 7, title: 'Math', chapter_count: 3, lesson_count: 9 }]
    })

    const { container } = renderAdminCoursesPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Controlled subjects failure')
    })
    expect(mocks.toastError).toHaveBeenCalledWith('Controlled subjects failure')

    await clickButton(container, 'Reessayer')

    await waitFor(() => {
      expect(container.textContent).toContain('Math')
      expect(container.textContent).toContain('3 topics / 9 items')
    })
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

})

function renderAdminCoursesPage(swrConfig: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { ...apiSWRConfig, ...swrConfig, provider: () => new Map() } },
        React.createElement(AdminCoursesPage),
      ),
    )
  })

  return { container, root }
}

async function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
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
