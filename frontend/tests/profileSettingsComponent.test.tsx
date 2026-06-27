// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: ({ fill, priority, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    priority?: boolean
    unoptimized?: boolean
  }) => {
    void fill
    void priority
    void unoptimized
    return React.createElement('img', props)
  },
}))

import { FigmaProfile } from '@/components/figma/profile'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('FigmaProfile settings view', () => {
  it('keeps large profile collections cheap to render offscreen', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'figma', 'profile.tsx'), 'utf8')

    expect(source).toContain('content-visibility: auto;')
    expect(source).toContain('contain-intrinsic-size: auto 82px;')
  })

  it('exposes account, preference, security, billing, and data controls', () => {
    const { container } = renderProfile()

    act(() => {
      buttonByText(container, 'Settings').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const settings = container.querySelector('[aria-label="Profile settings"]')
    expect(settings).not.toBeNull()
    const text = settings?.textContent ?? ''

    expect(text).toContain('Account')
    expect(text).toContain('Display name')
    expect(text).toContain('Kresco Student')
    expect(text).toContain('Learning')
    expect(text).toContain('Language')
    expect(text).toContain('Notifications')
    expect(text).toContain('Live session alerts')
    expect(text).toContain('Privacy and security')
    expect(text).toContain('Password and sign-in')
    expect(text).toContain('Billing and data')
    expect(text).toContain('Plan and invoices')
    expect(text).toContain('Export learning data')
    expect(text).toContain('Delete account')
  })

  it('preloads saved and note collection destinations on row focus', () => {
    const onRoutePreload = vi.fn()
    const { container } = renderProfile({
      onRoutePreload,
      saves: [{
        id: 1,
        target_type: 'topic_item',
        target_id: 34,
        topic_id: 12,
        topic_item_id: 34,
        label: 'Limits lesson',
      }],
      notes: [{
        id: 2,
        body: 'Review the limits proof',
        topic_id: 12,
        topic_item_id: 34,
        tab_content_id: 8,
      }],
    })

    act(() => {
      buttonByText(container, 'Saved').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => {
      linkByHref(container, '/topics/12?item=34').focus()
    })
    expect(onRoutePreload).toHaveBeenCalledWith('/topics/12?item=34')

    onRoutePreload.mockClear()

    act(() => {
      buttonByText(container, 'Notes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      linkByHref(container, '/topics/12?item=34&tab=8').focus()
    })
    expect(onRoutePreload).toHaveBeenCalledWith('/topics/12?item=34&tab=8')
  })
})

function renderProfile(overrides: Partial<React.ComponentProps<typeof FigmaProfile>> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(
      <FigmaProfile
        user={{
          full_name: 'Kresco Student',
          email: 'student@kresco.local',
          niveau: '2BAC',
          filiere: 'Sciences Math B',
          created_at: '2026-05-01T00:00:00Z',
        }}
        xp={{
          total_xp: 6840,
          level: 4,
          streak_days: 1,
        }}
        stats={{
          totalWatchMinutes: 30,
          quizzesPassed: 2,
          itemsCompleted: 4,
          isPro: true,
        }}
        badgeInventory={{
          badges: [],
          earned_count: 0,
          total_count: 0,
        }}
        subjects={overrides.subjects ?? []}
        notes={overrides.notes ?? []}
        saves={overrides.saves ?? []}
        sidebar={{
          chronoUnits: [],
          calendarDays: [],
          liveEvents: [],
          leaderboardEntries: [],
        }}
        onRoutePreload={overrides.onRoutePreload}
      />,
    )
  })

  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

function linkByHref(container: HTMLElement, href: string) {
  const link = Array.from(container.querySelectorAll('a')).find((item) => item.getAttribute('href') === href)
  if (!link) throw new Error(`link not found: ${href}`)
  return link
}
