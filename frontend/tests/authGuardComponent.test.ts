// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthGuard from '@/components/AuthGuard.jsx'
import ProfessorAuthGate from '@/components/professor/ProfessorAuthGate'
import { replaceBrowserLocation } from '@/lib/browserNavigation'
import { getMyProfile } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'
import {
  KRESCO_TOKEN_KEY,
  KRESCO_USER_KEY,
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

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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
  it('renders children for an existing hydrated student session without fetching profile', async () => {
    localStorage.setItem(KRESCO_TOKEN_KEY, 'legacy-token')
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))

    const { container } = renderComponent(
      React.createElement(AuthGuard, null, React.createElement('main', null, 'Student child')),
    )

    await waitFor(() => {
      expect(container.textContent).toContain('Student child')
    })
    expect(localStorage.getItem(KRESCO_TOKEN_KEY)).toBeNull()
    expect(getMyProfileMock).not.toHaveBeenCalled()
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to the route-specific login destination', async () => {
    window.history.pushState({}, '', '/professor/chat')

    const { container } = renderComponent(
      React.createElement(AuthGuardForTest, { requireRole: 'professor' }, React.createElement('main', null, 'Professor child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/professor/login')
    })
    expect(container.textContent).toContain('Redirecting to login')
    expect(getMyProfileMock).not.toHaveBeenCalled()
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
    getMyProfileMock.mockResolvedValueOnce(studentUser as never)

    const { container } = renderComponent(
      React.createElement(ProfessorAuthGate, null, React.createElement('main', null, 'Professor child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/home')
    })
    expect(container.textContent).not.toContain('Professor child')
  })

  it('logs out and redirects when server profile hydration fails', async () => {
    localStorage.setItem(KRESCO_USER_KEY, JSON.stringify(studentUser))
    getMyProfileMock.mockRejectedValueOnce(new Error('profile failed'))

    renderComponent(
      React.createElement(AuthGuardForTest, { requireStaff: true }, React.createElement('main', null, 'Admin child')),
    )

    await waitFor(() => {
      expect(replaceBrowserLocationMock).toHaveBeenCalledWith('/')
    })
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
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
