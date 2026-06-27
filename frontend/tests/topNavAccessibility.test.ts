// @vitest-environment jsdom

import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const topNavMocks = vi.hoisted(() => ({
  preloadStudentRouteData: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/realtime', () => ({
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

vi.mock('@/lib/professor', () => ({
  getStudentProfessorChat: vi.fn().mockResolvedValue({
    eligible: true,
    reason: '',
    offerings: [],
    conversations: [],
    teacher_threads: [
      { unread_count: 3 },
    ],
  }),
}))

vi.mock('@/components/KrescoWordmark', () => ({
  default: () => React.createElement('span', null, 'Kresco'),
}))

vi.mock('@/lib/studentRoutePreload', () => ({
  preloadStudentRouteData: topNavMocks.preloadStudentRouteData,
}))

import TopNav from '@/components/TopNav'
import { listNotifications } from '@/lib/notifications'
import { getStudentProfessorChat } from '@/lib/professor'
import { useAuthStore } from '@/lib/store'
import {
  TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX,
  TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES,
  clearTopNavBadgeCache,
  flushPendingTopNavBadgeSessionCacheWrites,
  readTopNavNotificationCache,
  topNavNotificationSessionStorageKey,
  topNavProfessorChatSessionStorageKey,
  writeCurrentNotificationCache,
} from '@/lib/topNavBadgeCache'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  clearTopNavBadgeCache()
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
  it('keeps realtime and badge API modules out of the eager dashboard shell bundle', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'TopNav.tsx'), 'utf8')
    const cacheSource = readFileSync(join(process.cwd(), 'lib', 'topNavBadgeCache.ts'), 'utf8')

    expect(source).not.toContain("import { subscribeKrescoRealtime")
    expect(source).not.toContain("import { deleteAllNotifications")
    expect(source).not.toContain("import { getStudentProfessorChat")
    expect(source).toContain("import('@/lib/realtime')")
    expect(source).toContain('scheduleTopNavIdleWork')
    expect(source).toContain('requestIdleCallback')
    expect(cacheSource).toContain("import('@/lib/notifications')")
    expect(cacheSource).toContain("import('@/lib/professor')")
  })

  it('does not prefetch the heavyweight Zed workspace from the persistent nav', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'TopNav.tsx'), 'utf8')

    expect(source).toContain("{ href: '/zed', label: 'Zed Mode', Icon: Zap, prefetch: false }")
    expect(source).toContain('prefetch={prefetch}')
  })

  it('warms route data once when inactive nav links receive intent', () => {
    act(() => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    const coursesLink = Array.from(document.querySelectorAll('a'))
      .find((link) => link.getAttribute('href') === '/courses')
    expect(coursesLink).not.toBeNull()

    act(() => {
      coursesLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      coursesLink?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    })

    expect(topNavMocks.preloadStudentRouteData).toHaveBeenCalledWith('/courses', expect.any(Function), { cache: expect.any(Object) })
    expect(topNavMocks.preloadStudentRouteData).toHaveBeenCalledTimes(1)

    topNavMocks.preloadStudentRouteData.mockClear()

    act(() => {
      document.addEventListener('click', (event) => event.preventDefault(), { once: true })
      coursesLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }))
    })

    expect(topNavMocks.preloadStudentRouteData).not.toHaveBeenCalled()
  })

  it('allows inactive nav route data to warm again after the intent dedupe window', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)

    try {
      act(() => {
        mountedRoot?.render(React.createElement(TopNav))
      })

      const coursesLink = Array.from(document.querySelectorAll('a'))
        .find((link) => link.getAttribute('href') === '/courses')
      expect(coursesLink).not.toBeNull()

      act(() => {
        coursesLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      })
      expect(topNavMocks.preloadStudentRouteData).toHaveBeenCalledTimes(1)

      topNavMocks.preloadStudentRouteData.mockClear()
      nowSpy.mockReturnValue(2499)
      act(() => {
        coursesLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      })
      expect(topNavMocks.preloadStudentRouteData).not.toHaveBeenCalled()

      nowSpy.mockReturnValue(2500)
      act(() => {
        coursesLink?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      })
      expect(topNavMocks.preloadStudentRouteData).toHaveBeenCalledWith('/courses', expect.any(Function), { cache: expect.any(Object) })
    } finally {
      nowSpy.mockRestore()
    }
  })

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
    expect(document.querySelector('[title="Notes"]')).toBeNull()
    expect(svgIcons.length).toBeGreaterThan(0)
    expect(svgIcons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('keeps the empty notification dropdown low-copy', async () => {
    await act(async () => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    const notificationsButton = findButton('Notifications')
    expect(notificationsButton).not.toBeNull()

    await act(async () => {
      notificationsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('No notifications')
    })
    expect(document.body.textContent).not.toContain('All caught up')
    expect(document.body.textContent).not.toContain('No notifications yet')
  })

  it('moves eligible student professor chat into a badged utility icon', async () => {
    useAuthStore.setState({
      token: null,
      user: { id: 1, role: 'student', tier: 'vip', full_name: 'VIP Student' },
      isHydrated: true,
    })

    await act(async () => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    await vi.waitFor(() => {
      expect(findLink('Professor Chat, 3 unread')).not.toBeNull()
    })

    const professorChatLink = findLink('Professor Chat, 3 unread')
    expect(professorChatLink?.getAttribute('href')).toBe('/professor-chat')
    expect(professorChatLink?.textContent).toContain('3')
    expect(document.querySelector('[title="Notes"]')).toBeNull()
  })

  it('reuses recent badge data across top nav remounts', async () => {
    useAuthStore.setState({
      token: null,
      user: { id: 42, role: 'student', tier: 'vip', full_name: 'Cached Student' },
      isHydrated: true,
    })

    await act(async () => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    await vi.waitFor(() => {
      expect(findLink('Professor Chat, 3 unread')).not.toBeNull()
    })
    expect(vi.mocked(listNotifications)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getStudentProfessorChat)).toHaveBeenCalledTimes(1)

    act(() => {
      mountedRoot?.unmount()
    })
    mountedRoot = createRoot(container!)
    vi.clearAllMocks()

    await act(async () => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    expect(findLink('Professor Chat, 3 unread')).not.toBeNull()
    await act(async () => {
      await Promise.resolve()
    })
    expect(vi.mocked(listNotifications)).not.toHaveBeenCalled()
    expect(vi.mocked(getStudentProfessorChat)).not.toHaveBeenCalled()
  })

  it('keeps top nav badge writes off the interaction path until idle or pagehide flush', () => {
    const notification = {
      id: 101,
      type: 'system',
      title: 'Fast cache',
      body: 'Persisted later',
      is_read: false,
      created_at: '2026-06-27T08:00:00Z',
    }

    writeCurrentNotificationCache('404', [notification], 1)

    expect(readTopNavNotificationCache('404')).toEqual({
      notifications: [notification],
      unread_count: 1,
    })
    expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('404'))).toBeNull()

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('404'))).toContain('Fast cache')
  })

  it('reuses an in-memory top nav badge session key index across repeated flushes', () => {
    const keySpy = vi.spyOn(Storage.prototype, 'key')

    try {
      writeCurrentNotificationCache('501', [], 0)
      flushPendingTopNavBadgeSessionCacheWrites()
      const keyReadsAfterFirstFlush = keySpy.mock.calls.length

      expect(keyReadsAfterFirstFlush).toBeGreaterThan(0)

      writeCurrentNotificationCache('502', [], 0)
      flushPendingTopNavBadgeSessionCacheWrites()

      expect(keySpy).toHaveBeenCalledTimes(keyReadsAfterFirstFlush)
      expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('502'))).toContain('"unread_count":0')
    } finally {
      keySpy.mockRestore()
    }
  })

  it('prunes oldest top nav badge session entries only after exceeding the entry limit', () => {
    const now = Date.now()
    for (let index = 0; index < TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES; index += 1) {
      sessionStorage.setItem(topNavNotificationSessionStorageKey(String(index + 1)), JSON.stringify({
        updatedAt: now - (TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES - index),
        data: {
          notifications: [],
          unread_count: index + 1,
        },
      }))
    }

    writeCurrentNotificationCache('new', [], 0)
    flushPendingTopNavBadgeSessionCacheWrites()

    const versionedKeys: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(TOP_NAV_BADGE_SESSION_CACHE_KEY_PREFIX)) versionedKeys.push(key)
    }

    expect(versionedKeys).toHaveLength(TOP_NAV_BADGE_SESSION_CACHE_MAX_ENTRIES)
    expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('1'))).toBeNull()
    expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('2'))).toContain('"unread_count":2')
    expect(sessionStorage.getItem(topNavNotificationSessionStorageKey('new'))).toContain('"unread_count":0')
  })

  it('hydrates recent badge data from session storage before hitting badge endpoints', async () => {
    sessionStorage.setItem(topNavNotificationSessionStorageKey('77'), JSON.stringify({
      updatedAt: Date.now(),
      data: {
        notifications: [],
        unread_count: 2,
      },
    }))
    sessionStorage.setItem(topNavProfessorChatSessionStorageKey('77'), JSON.stringify({
      updatedAt: Date.now(),
      data: 3,
    }))
    useAuthStore.setState({
      token: null,
      user: { id: 77, role: 'student', tier: 'vip', full_name: 'Session Cached Student' },
      isHydrated: true,
    })

    await act(async () => {
      mountedRoot?.render(React.createElement(TopNav))
    })

    await vi.waitFor(() => {
      expect(findButton('Notifications, 2 unread')).not.toBeNull()
      expect(findLink('Professor Chat, 3 unread')).not.toBeNull()
    })
    expect(vi.mocked(listNotifications)).not.toHaveBeenCalled()
    expect(vi.mocked(getStudentProfessorChat)).not.toHaveBeenCalled()
  })
})

function findButton(label: string) {
  return Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === label) ?? null
}

function findLink(label: string) {
  return Array.from(document.querySelectorAll('a')).find((link) => link.getAttribute('aria-label') === label) ?? null
}
