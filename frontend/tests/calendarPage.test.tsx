// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CalendarPage from '@/app/(dashboard)/calendar/page'
import { apiSWRConfig } from '@/lib/apiData'
import { addDays, formatCalendarDate, startOfDay, startOfWeek } from '@/lib/calendarViewModel'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  searchParams: '',
  subscribe: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
}))

vi.mock('@/hooks/useNotificationChannelsSubscription', () => ({
  useNotificationChannelsSubscription: mocks.subscribe,
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('@/lib/lazyToast', () => ({
  showToastError: mocks.toastError,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchParams = ''
  document.body.innerHTML = ''
  mountedRoots = []
  useAuthStore.setState({
    user: null,
    token: null,
    isHydrated: true,
    logoutError: null,
    isLoggingOut: false,
  })
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
})

describe('Calendar page data behavior', () => {
  it('loads weekly events through shared SWR keys and reuses cached data across remounts', async () => {
    const cache = new Map()
    const event = makeCurrentWeekEvent()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/calendar/events?')) return { data: [event] }
      throw new Error(`unexpected url ${url}`)
    })

    const first = renderCalendarPage(cache)

    await waitFor(() => {
      expect(first.container.textContent).toContain('Functions live')
    })
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    const listUrl = String(mocks.apiGet.mock.calls[0]?.[0] ?? '')
    expect(listUrl).toMatch(/^\/calendar\/events\?/)
    expect(listUrl).toContain('start=')
    expect(listUrl).toContain('end=')
    expect(listUrl).toContain('timezone=')

    unmountCalendarPage(first.root)
    mocks.apiGet.mockImplementation(() => new Promise(() => undefined))

    const second = renderCalendarPage(cache, { revalidateIfStale: false })

    expect(second.container.textContent).toContain('Functions live')
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
  })

  it('preloads adjacent week events on navigation intent before click', async () => {
    const event = makeCurrentWeekEvent()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/calendar/events?')) return { data: [event] }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderCalendarPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Functions live')
    })
    mocks.apiGet.mockClear()

    const nextWeekButton = buttonByLabel(container, 'Next week')
    act(() => {
      nextWeekButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    })
    const nextWeekUrl = String(mocks.apiGet.mock.calls[0]?.[0] ?? '')
    const nextWeekStart = addDays(startOfWeek(startOfDay(new Date())), 7)
    expect(nextWeekUrl).toContain(`start=${formatCalendarDate(nextWeekStart)}`)
    expect(nextWeekUrl).toContain(`end=${formatCalendarDate(addDays(nextWeekStart, 6))}`)

    mocks.apiGet.mockClear()
    act(() => {
      nextWeekButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })
})

function renderCalendarPage(cache = new Map(), swrOverrides: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(
      SWRConfig,
      {
        value: {
          ...apiSWRConfig,
          provider: () => cache,
          dedupingInterval: 0,
          errorRetryCount: 0,
          ...swrOverrides,
        },
      },
      React.createElement(CalendarPage),
    ))
  })

  return { container, root }
}

function unmountCalendarPage(root: Root) {
  const entry = mountedRoots.find((item) => item.root === root)
  if (!entry) return
  act(() => {
    entry.root.unmount()
  })
  entry.container.remove()
  mountedRoots = mountedRoots.filter((item) => item.root !== root)
}

function buttonByLabel(container: HTMLElement, label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`)
  return button
}

function makeCurrentWeekEvent() {
  const startsAt = addDays(startOfWeek(startOfDay(new Date())), 1)
  startsAt.setHours(10, 0, 0, 0)
  const endsAt = new Date(startsAt)
  endsAt.setHours(11, 0, 0, 0)

  return {
    id: 17,
    event_type: 'live_session' as const,
    title: 'Functions live',
    subtitle: 'Weekly review',
    teacher_name: 'Kresco teacher',
    subject_id: 2,
    subject_title: 'Mathematics',
    topic_id: 42,
    topic_title: 'Functions',
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    description: 'Bring notes',
    preparation_href: '/home/2',
    join_url: 'https://example.com/live',
    status: 'scheduled',
    color: '#5b60f9',
  }
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
