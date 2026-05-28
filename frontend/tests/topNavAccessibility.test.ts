// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/ably', () => ({
  subscribeKrescoRealtime: vi.fn(() => () => {}),
  userNotificationsChannelName: vi.fn(() => 'kresco:user:1:notifications'),
}))

vi.mock('@/lib/notifications', () => ({
  deleteAllNotifications: vi.fn(),
  deleteNotification: vi.fn(),
  listNotifications: vi.fn().mockResolvedValue({ notifications: [], unread_count: 0 }),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}))

vi.mock('@/components/KrescoWordmark', () => ({
  default: () => React.createElement('span', null, 'Kresco'),
}))

import TopNav from '@/components/TopNav'
import { useAuthStore } from '@/lib/store'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ token: null, user: null, isHydrated: true })
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  mountedRoot = createRoot(container)
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.unmount()
    })
    mountedRoot = null
  }
  container?.remove()
  container = null
})

describe('TopNav accessibility', () => {
  it('exposes toggle state and hides decorative icons from assistive tech', () => {
    act(() => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    const menuButton = findButton('Navigation menu')
    const notificationsButton = findButton('Notifications')
    const accountButton = findButton('Account menu')
    const svgIcons = Array.from(document.querySelectorAll('svg'))

    expect(menuButton).not.toBeNull()
    expect(menuButton?.getAttribute('aria-expanded')).toBe('false')
    expect(notificationsButton?.getAttribute('aria-expanded')).toBe('false')
    expect(accountButton).not.toBeNull()
    expect(accountButton?.getAttribute('aria-expanded')).toBe('false')
    expect(svgIcons.length).toBeGreaterThan(0)
    expect(svgIcons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true)
  })
})

function findButton(label: string) {
  return Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === label) ?? null
}
