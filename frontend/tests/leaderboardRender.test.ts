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
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    priority?: boolean
    unoptimized?: boolean
  }) => {
    void _fill
    void _priority
    void _unoptimized
    return React.createElement('img', props)
  },
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
  it('renders widget results and pins the current user outside the top 10', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: leaderboardEntriesWithCurrentRank(14) })
    const onExpand = vi.fn()

    const { container } = renderComponent(React.createElement(LeaderboardWidget, { onExpand }))
    await act(async () => {
      await flushPromises()
    })

    expect(mocks.apiGet).toHaveBeenCalledWith('/progress/leaderboard', {
      params: { limit: 10, include_current: true },
    })
    expect(container.textContent).toContain('Classement')
    expect(container.textContent).toContain('Player 1')
    expect(container.textContent).toContain('Current Student')
    expect(container.textContent).toContain('Rang global')
    expect(container.textContent).toContain('(vous)')

    act(() => {
      buttonByText(container, 'Voir tout')?.click()
    })
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('shows the backend search result instead of falling back to the previous page', async () => {
    mockPageFetch(leaderboardEntries(3), leaderboardEntries(3))

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

      mockPageFetch(leaderboardEntries(3), [])
      await act(async () => {
        setInputValue(input!, 'not-on-this-page')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      expect(mocks.apiGet).toHaveBeenLastCalledWith('/progress/leaderboard/seasons', {
        params: { season: 'weekly', limit: 20, offset: 0, search: 'not-on-this-page' },
      })
      expect(container.textContent).toContain('Aucun joueur trouve')
      expect(container.textContent).toContain('Aucun resultat pour "not-on-this-page".')
      expect(container.textContent).not.toContain('Player 1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not treat the first visible row as the current user when the user is absent', async () => {
    mockPageFetch(leaderboardEntriesWithoutCurrentUser(3), leaderboardEntriesWithoutCurrentUser(3))

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    expect(container.textContent).toContain('Player 1')
    expect(container.textContent).toContain('Votre progression')
    expect(container.textContent).toContain("Votre rang n'apparait pas dans ces resultats.")
    expect(container.textContent).not.toContain('Votre position actuelle')
  })

  it('pins the current user with their global rank when outside the top 20', async () => {
    mockPageFetch(leaderboardEntriesWithCurrentRank(27), leaderboardEntries(3))

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    mockPageFetch(leaderboardEntriesWithCurrentRank(27), leaderboardEntries(3))
    await act(async () => {
      buttonByText(container, 'Global')?.click()
      await flushPromises()
    })

    expect(mocks.apiGet).toHaveBeenCalledWith('/progress/leaderboard', {
      params: { limit: 20, offset: 0, include_current: true },
    })
    expect(container.textContent).toContain('Votre rang global')
    expect(container.textContent).toContain('Hors top 20')
    expect(container.textContent).toContain('Current Student')
    expect(container.textContent).toContain('2,300')
    expect(container.textContent).toContain('(vous)')
    expect(container.querySelector('img[src="/avatar-current.png"]')).not.toBeNull()
    expect(Array.from(container.querySelectorAll('[aria-label="Rang 27"]')).length).toBe(1)
  })

  it('highlights the current user in place when they are in the top 10', async () => {
    mockPageFetch(leaderboardEntries(10), leaderboardEntries(10))

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    const highlightedRows = Array.from(container.querySelectorAll('div')).filter((row) => (
      typeof row.className === 'string'
      && row.className.includes('border-l-[color:var(--primary)]')
      && row.textContent?.includes('Current Student')
    ))
    expect(highlightedRows.length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('Hors top 10')
  })

  it('highlights the current major league without duplicate edge markers', async () => {
    mockPageFetch(leaderboardEntries(3), leaderboardEntries(3))

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    const leagueImages = Array.from(container.querySelectorAll('img[alt$=" IV"]'))
    expect(leagueImages.map((image) => image.getAttribute('alt'))).toEqual([
      'Bronze IV',
      'Silver IV',
      'Gold IV',
      'Sapphire IV',
    ])

    const bronzeMarker = leagueImages[0]?.parentElement
    expect(bronzeMarker?.getAttribute('aria-current')).toBe('true')
    expect(bronzeMarker?.className).toContain('border-[3px]')
    expect(bronzeMarker?.className).toContain('border-[#cc6a00]')
  })

  it('shows one demotion boundary when multiple players share the demotion rank', async () => {
    const seasonEntries = tiedDemotionLeaderboardEntries()
    mocks.apiGet
      .mockResolvedValueOnce({ data: leaderboardEntries(3) })
      .mockResolvedValueOnce({ data: seasonLeaderboard(seasonEntries, 8) })

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    expect(container.textContent).toContain('Youssef El Idrissi')
    expect(container.textContent).toContain('Pr Lina Amrani')
    const demotionBoundaries = Array.from(container.querySelectorAll('span')).filter((node) => (
      node.textContent === 'Zone de demotion'
    ))
    expect(demotionBoundaries).toHaveLength(1)
  })

  it('shows an actionable error state and retries the leaderboard request', async () => {
    mocks.apiGet
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ data: seasonLeaderboard(leaderboardEntries(1)) })
    mockPageFetch(leaderboardEntries(1), leaderboardEntries(1))

    const { container } = renderComponent(React.createElement(LeaderboardPage))
    await act(async () => {
      await flushPromises()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('Impossible de charger le classement.')
    expect(container.textContent).toContain('Impossible de charger le classement.')

    await act(async () => {
      buttonByText(container, 'Reessayer')?.click()
      await flushPromises()
    })

    expect(mocks.apiGet).toHaveBeenCalledTimes(4)
    expect(container.textContent).toContain('Current Student')
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

  it('passes debounced search text to the active leaderboard endpoint', async () => {
    vi.useFakeTimers()
    mockPageFetch(leaderboardEntries(3), leaderboardEntries(3))

    try {
      const { container } = renderComponent(React.createElement(LeaderboardPage))
      await act(async () => {
        await flushPromises()
      })

      const input = container.querySelector('input[aria-label="Rechercher un joueur"]') as HTMLInputElement | null
      expect(input).not.toBeNull()

      mockPageFetch(leaderboardEntries(3), namedLeaderboardEntries('Current'))
      await act(async () => {
        setInputValue(input!, 'Current')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        vi.advanceTimersByTime(250)
        await flushPromises()
      })

      expect(mocks.apiGet).toHaveBeenLastCalledWith('/progress/leaderboard/seasons', {
        params: { season: 'weekly', limit: 20, offset: 0, search: 'Current' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores stale leaderboard responses after a newer search resolves', async () => {
    vi.useFakeTimers()
    const slowSearch = createDeferred<{ data: ReturnType<typeof leaderboardEntries> }>()
    const slowSeasonSearch = createDeferred<{ data: ReturnType<typeof seasonLeaderboard> }>()
    const fastSearch = createDeferred<{ data: ReturnType<typeof leaderboardEntries> }>()
    const fastSeasonSearch = createDeferred<{ data: ReturnType<typeof seasonLeaderboard> }>()

    mocks.apiGet
      .mockResolvedValueOnce({ data: leaderboardEntries(3) })
      .mockResolvedValueOnce({ data: seasonLeaderboard(leaderboardEntries(3)) })
      .mockReturnValueOnce(slowSearch.promise)
      .mockReturnValueOnce(slowSeasonSearch.promise)
      .mockReturnValueOnce(fastSearch.promise)
      .mockReturnValueOnce(fastSeasonSearch.promise)

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
        fastSearch.resolve({ data: leaderboardEntries(3) })
        fastSeasonSearch.resolve({ data: seasonLeaderboard(namedLeaderboardEntries('Fast Result')) })
        await flushPromises()
      })

      expect(container.textContent).toContain('Fast Result')
      expect(container.textContent).not.toContain('Slow Result')

      await act(async () => {
        slowSearch.resolve({ data: leaderboardEntries(3) })
        slowSeasonSearch.resolve({ data: seasonLeaderboard(namedLeaderboardEntries('Slow Result')) })
        await flushPromises()
      })

      expect(container.textContent).toContain('Fast Result')
      expect(container.textContent).not.toContain('Slow Result')
    } finally {
      vi.useRealTimers()
    }
  })
})

function mockPageFetch(globalEntries: ReturnType<typeof leaderboardEntries>, seasonEntries: ReturnType<typeof leaderboardEntries>) {
  mocks.apiGet
    .mockResolvedValueOnce({ data: globalEntries })
    .mockResolvedValueOnce({ data: seasonLeaderboard(seasonEntries) })
}

function seasonLeaderboard(entries: ReturnType<typeof leaderboardEntries>, totalEntries = Math.max(entries.length, 10)) {
  return {
    season: 'weekly',
    total_entries: totalEntries,
    entries,
  }
}

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

function leaderboardEntriesWithCurrentRank(currentRank: number) {
  const leaders = leaderboardEntries(10).map((entry) => ({
    ...entry,
    full_name: `Player ${entry.rank}`,
    is_current_user: false,
  }))
  return [
    ...leaders,
    {
      rank: currentRank,
      user_id: currentRank,
      full_name: 'Current Student',
      avatar_url: '/avatar-current.png',
      total_xp: 2300,
      level: 7,
      is_current_user: true,
    },
  ]
}

function leaderboardEntriesWithoutCurrentUser(count: number) {
  return leaderboardEntries(count).map((entry) => ({
    ...entry,
    full_name: `Player ${entry.rank}`,
    is_current_user: false,
  }))
}

function tiedDemotionLeaderboardEntries() {
  return [
    ...leaderboardEntriesWithoutCurrentUser(6),
    {
      rank: 7,
      user_id: 701,
      full_name: 'Youssef El Idrissi',
      avatar_url: '',
      total_xp: 2800,
      season_xp: 10,
      level: 11,
      is_current_user: false,
    },
    {
      rank: 7,
      user_id: 702,
      full_name: 'Pr Lina Amrani',
      avatar_url: '',
      total_xp: 2700,
      season_xp: 10,
      level: 1,
      is_current_user: true,
    },
  ]
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
