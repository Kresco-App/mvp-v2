// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}))

import { LeaderboardPage, LeaderboardWidget } from '@/components/Leaderboard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mountedRoots = []
  document.body.innerHTML = ''
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

describe('leaderboard rendering', () => {
  it('renders widget results and keeps the current user visible outside the top ranks', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: leaderboardEntries(8) })
    const onExpand = vi.fn()

    const { container } = renderComponent(React.createElement(LeaderboardWidget, { onExpand }))
    await act(async () => {
      await flushPromises()
    })

    expect(mocks.apiGet).toHaveBeenCalledWith('/progress/leaderboard', { params: { limit: 5 } })
    expect(container.textContent).toContain('Classement')
    expect(container.textContent).toContain('Player 1')
    expect(container.textContent).toContain('Current Student')
    expect(container.textContent).toContain('(vous)')

    act(() => {
      buttonByText(container, 'Voir tout')?.click()
    })
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('shows the backend search result instead of falling back to the previous page', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: leaderboardEntries(3) })
    mocks.apiGet.mockResolvedValueOnce({ data: [] })

    vi.useFakeTimers()
    try {
      const { container } = renderComponent(React.createElement(LeaderboardPage))
      await act(async () => {
        await flushPromises()
      })

      expect(container.textContent).toContain('Player 1')
      expect(container.textContent).toContain('Current Student')

      const input = container.querySelector('input[aria-label="Rechercher un joueur"]') as HTMLInputElement | null
      expect(input).not.toBeNull()

      await act(async () => {
        setInputValue(input!, 'not-on-this-page')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      expect(mocks.apiGet).toHaveBeenLastCalledWith('/progress/leaderboard', {
        params: { limit: 20, offset: 0, search: 'not-on-this-page' },
      })
      expect(container.textContent).toContain('Aucun joueur trouve pour "not-on-this-page"')
      expect(container.textContent).not.toContain('Player 1')
      expect(container.textContent).not.toContain('Current Student')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not treat the first visible row as the current user when the user is absent', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: leaderboardEntriesWithoutCurrentUser(3) })

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    expect(container.textContent).toContain('Player 1')
    expect(container.textContent).toContain('Your progress')
    expect(container.textContent).toContain('Your rank is not shown in these results.')
    expect(container.textContent).not.toContain('Keep track of your progress')
  })

  it('keeps extracted row and marker helpers out of the page component file', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/Leaderboard.tsx'), 'utf8')
    const partsSource = readFileSync(resolve(process.cwd(), 'components/leaderboard/LeaderboardParts.tsx'), 'utf8')

    expect(source).toContain("@/components/leaderboard/LeaderboardParts")
    expect(source).not.toMatch(/function\s+(RankBadge|AvatarBubble|LeaderboardRow|LeagueMarker|ZoneDivider|LeaderboardRowsSkeleton)\s*\(/)
    expect(source).not.toMatch(/interface\s+LeaderboardEntry/)
    expect(partsSource).toMatch(/export const LeaderboardRow = memo/)
    expect(partsSource).toMatch(/export const LeaderboardListRow = memo/)
    expect(partsSource).toMatch(/export const AvatarBubble = memo/)
  })

  it('passes debounced search text to the leaderboard endpoint', async () => {
    vi.useFakeTimers()
    mocks.apiGet.mockResolvedValue({ data: leaderboardEntries(3) })

    try {
      const { container } = renderComponent(React.createElement(LeaderboardPage))
      await act(async () => {
        await flushPromises()
      })

      const input = container.querySelector('input[aria-label="Rechercher un joueur"]') as HTMLInputElement | null
      expect(input).not.toBeNull()

      await act(async () => {
        setInputValue(input!, 'Current')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      expect(mocks.apiGet).toHaveBeenLastCalledWith('/progress/leaderboard', {
        params: { limit: 20, offset: 0, search: 'Current' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores stale leaderboard responses after a newer search resolves', async () => {
    vi.useFakeTimers()
    const slowSearch = createDeferred<{ data: ReturnType<typeof leaderboardEntries> }>()
    const fastSearch = createDeferred<{ data: ReturnType<typeof leaderboardEntries> }>()

    mocks.apiGet
      .mockResolvedValueOnce({ data: leaderboardEntries(3) })
      .mockReturnValueOnce(slowSearch.promise)
      .mockReturnValueOnce(fastSearch.promise)

    try {
      const { container } = renderComponent(React.createElement(LeaderboardPage))
      await act(async () => {
        await flushPromises()
      })

      const input = container.querySelector('input[aria-label="Rechercher un joueur"]') as HTMLInputElement | null
      expect(input).not.toBeNull()

      await act(async () => {
        setInputValue(input!, 'slow')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      await act(async () => {
        setInputValue(input!, 'fast')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      await act(async () => {
        fastSearch.resolve({ data: namedLeaderboardEntries('Fast Result') })
        await flushPromises()
      })

      expect(container.textContent).toContain('Fast Result')
      expect(container.textContent).not.toContain('Slow Result')

      await act(async () => {
        slowSearch.resolve({ data: namedLeaderboardEntries('Slow Result') })
        await flushPromises()
      })

      expect(container.textContent).toContain('Fast Result')
      expect(container.textContent).not.toContain('Slow Result')
    } finally {
      vi.useRealTimers()
    }
  })
})

function leaderboardEntries(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1
    const isCurrentUser = rank === count
    return {
      rank,
      user_id: rank,
      full_name: isCurrentUser ? 'Current Student' : `Player ${rank}`,
      avatar_url: '',
      total_xp: 5000 - rank * 100,
      level: 10 - Math.min(rank, 8),
      is_current_user: isCurrentUser,
    }
  })
}

function leaderboardEntriesWithoutCurrentUser(count: number) {
  return leaderboardEntries(count).map((entry) => ({
    ...entry,
    full_name: `Player ${entry.rank}`,
    is_current_user: false,
  }))
}

function namedLeaderboardEntries(name: string) {
  return [
    {
      rank: 1,
      user_id: name.length,
      full_name: name,
      avatar_url: '',
      total_xp: 9000,
      level: 9,
      is_current_user: true,
    },
  ]
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(element)
  })

  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.textContent?.includes(text)
  )) ?? null
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
