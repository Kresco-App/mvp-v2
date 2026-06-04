// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthGuard from '@/components/AuthGuard'
import ProfessorAuthGate from '@/components/professor/ProfessorAuthGate'
import { replaceBrowserLocation } from '@/lib/browserNavigation'
import { getMyProfile } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'
import {
  KRESCO_TOKEN_KEY,
  KRESCO_USER_KEY,
  KRESCO_USER_ROLE_COOKIE,
} from '@/lib/authSession'

vi.mock('@/lib/browserNavigation', () => ({
  replaceBrowserLocation: vi.fn(),
}));

vi.mock('@/lib/profile', () => ({
  getMyProfile: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const replaceBrowserLocationMock = vi.mocked(replaceBrowserLocation)
const getMyProfileMock = vi.mocked(getMyProfile)
const AuthGuardForTest = AuthGuard as React.ComponentType<{
  children?: React.ReactNode
  requireRole?: string | null
  requireStaff?: boolean
}>

const studentUser = {
  id: 1,
  email: 'student@example.com',
  role: 'student',
  is_staff: false,
  niveau: '2bac',
  filiere: 'Sciences Physiques',
}

const professorUser = {
  id: 2,
  email: 'professor@example.com',
  role: 'professor',
  is_staff: false,
}

function axiosLikeError(status: number) {
  return { response: { status } }
}

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.cookie = `${KRESCO_USER_ROLE_COOKIE}=; Path=/; Max-Age=0`
  document.body.innerHTML = ''
  window.history.pushState({}, '', '/home')
  useAuthStore.setState({
    user: null,
    token: null,
    isHydrated: false,
  })
  mountedRoots = []
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
})

describe('AuthGuard component behavior', () => {
  it('requires server profile verification before rendering a stored student session', async () => {
    localStorage.setItem(KRESCO_TOKEN_KEY, 'legacy-token')
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=student; Path=/`
    getMyProfileMock.mockResolvedValueOnce(studentUser as never)

    const { container } = renderComponent(
      React.createElement(AuthGuard, null, React.createElement('main', null, 'Student child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Student child')
    })
    expect(localStorage.getItem(KRESCO_TOKEN_KEY)).toBeNull()
    expect(getMyProfileMock).toHaveBeenCalledTimes(1)
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()
  })

  it('does not render children for forged localStorage-only sessions', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    getMyProfileMock.mockRejectedValueOnce(axiosLikeError(401) as never)

    const { container } = renderComponent(
      React.createElement(AuthGuard, null, React.createElement('main', null, 'Student child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/')
    })
    expect(container.textContent).not.toContain('Student child')
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('redirects unauthenticated users to the route-specific login destination', async () => {
    window.history.pushState({}, '', '/professor/chat')
    getMyProfileMock.mockRejectedValueOnce(axiosLikeError(401) as never)

    const { container } = renderComponent(
      React.createElement(AuthGuardForTest, { requireRole: 'professor' }, React.createElement('main', null, 'Professor child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/professor/login')
    })
    expect(container.textContent).toContain('Redirecting to login')
    expect(getMyProfileMock).toHaveBeenCalledTimes(1)
  })

  it('recovers a server-backed HttpOnly cookie session without a readable client token', async () => {
    getMyProfileMock.mockResolvedValueOnce(studentUser as never)

    const { container } = renderComponent(
      React.createElement(AuthGuard, null, React.createElement('main', null, 'Student child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Student child')
    })
    expect(useAuthStore.getState().token).toBe('cookie-session')
    expect(JSON.parse(localStorage.getItem(KRESCO_USER_KEY) || '{}')).toMatchObject(studentUser)
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()
  })

  it('renders ProfessorAuthGate children after the server confirms professor role', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    getMyProfileMock.mockResolvedValueOnce(professorUser as never)

    const { container } = renderComponent(
      React.createElement(ProfessorAuthGate, null, React.createElement('main', null, 'Professor child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Professor child')
    })
    expect(getMyProfileMock).toHaveBeenCalledTimes(1)
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()
  })

  it('denies ProfessorAuthGate when the server profile is not a professor', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    window.history.pushState({}, '', '/professor/chat')
    getMyProfileMock.mockResolvedValueOnce(studentUser as never)

    const { container } = renderComponent(
      React.createElement(ProfessorAuthGate, null, React.createElement('main', null, 'Professor child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Professor access required')
    })
    expect(container.textContent).not.toContain('Professor child')
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()

    const backLink = container.querySelector('a')
    expect(backLink?.getAttribute('href')).toBe('/home')
  })

  it('logs out and redirects when server profile hydration is unauthorized', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    getMyProfileMock.mockRejectedValueOnce(axiosLikeError(401) as never)

    renderComponent(
      React.createElement(AuthGuardForTest, { requireStaff: true }, React.createElement('main', null, 'Admin child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/')
    })
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('keeps the session and offers retry when server profile verification fails', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    getMyProfileMock
      .mockRejectedValueOnce(axiosLikeError(500) as never)
      .mockResolvedValueOnce({ ...studentUser, is_staff: true } as never)

    const { container } = renderComponent(
      React.createElement(AuthGuardForTest, { requireStaff: true }, React.createElement('main', null, 'Admin child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('We could not verify your session')
    })
    expect(useAuthStore.getState().user).toMatchObject(studentUser)
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()

    const retry = container.querySelector('button')
    expect(retry?.textContent).toContain('Retry verification')
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Admin child')
    })
    expect(getMyProfileMock).toHaveBeenCalledTimes(2)
  })

  it('rechecks access when another tab logs out and clears the shared session', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=student; Path=/`
    getMyProfileMock.mockResolvedValueOnce(studentUser as never)

    const { container } = renderComponent(
      React.createElement(AuthGuard, null, React.createElement('main', null, 'Student child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Student child')
    })

    getMyProfileMock.mockRejectedValueOnce(axiosLikeError(401) as never)
    document.cookie = `${KRESCO_USER_ROLE_COOKIE}=; Path=/; Max-Age=0`
    localStorage.removeItem(KRESCO_USER_KEY)

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: KRESCO_USER_KEY,
        oldValue: JSON.stringify(studentUser),
        newValue: null,
        storageArea: localStorage,
        url: window.location.href,
      }))
    })

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/')
    })
    expect(useAuthStore.getState().token).toBeNull()
    expect(container.textContent).not.toContain('Student child')
  })
})

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

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 25; index += 1) {
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
