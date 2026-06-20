// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LeaderboardPanel } from '@/components/figma/permanent-sidebar'
import type { PermanentSidebarLeaderboardEntry } from '@/lib/permanentSidebarViewModel'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
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

describe('permanent sidebar leaderboard widget', () => {
  it('renders a compact global preview with the current user pinned when outside the first rows', () => {
    const { container } = renderComponent(
      React.createElement(LeaderboardPanel, {
        entries: globalEntries(),
      }),
    )

    expect(container.textContent).toContain('Leaderboard')
    expect(container.textContent).toContain('Top global preview')
    expect(container.textContent).toContain('Global Player 1')
    expect(container.textContent).toContain('Global Player 5')
    expect(container.textContent).not.toContain('Global Player 6')
    expect(container.textContent).not.toContain('Promotion')
    expect(container.textContent).not.toContain('Demotion')
    expect(container.textContent).toContain('Your global rank')
    expect(container.textContent).toContain('45')
    expect(container.textContent).toContain('Current Student (you)')
    expect(container.textContent).toContain('4,200')
    expect(container.textContent).not.toContain('Global rank -')
  })

  it('highlights the current user in the top five without adding a pinned duplicate row', () => {
    const { container } = renderComponent(
      React.createElement(LeaderboardPanel, {
        entries: globalEntriesWithCurrentInTopFive(),
      }),
    )

    expect(container.textContent).toContain('Current Student (you)')
    expect(container.textContent).not.toContain('Your global rank')
    expect(container.textContent).not.toContain('Global Player 6')
    const currentRows = Array.from(container.querySelectorAll('a')).filter((row) => row.textContent?.includes('Current Student'))
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]?.className).toContain('ring-[#dfe5ff]')
  })
})

function globalEntries(): PermanentSidebarLeaderboardEntry[] {
  return [
    ...Array.from({ length: 20 }, (_, index) => ({
      rank: index + 1,
      user_id: index + 1,
      full_name: `Global Player ${index + 1}`,
      total_xp: 9000 - index * 100,
    })),
    {
      rank: 45,
      user_id: 45,
      full_name: 'Current Student',
      avatar_url: '/avatar-current.png',
      total_xp: 4200,
      level: 9,
      is_current_user: true,
    },
  ]
}

function globalEntriesWithCurrentInTopFive(): PermanentSidebarLeaderboardEntry[] {
  return globalEntries().map((entry) => (
    entry.rank === 2
      ? {
        ...entry,
        user_id: 45,
        full_name: 'Current Student',
        avatar_url: '/avatar-current.png',
        total_xp: 6290,
        level: 12,
        is_current_user: true,
      }
      : entry
  )).filter((entry) => entry.rank !== 45)
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
