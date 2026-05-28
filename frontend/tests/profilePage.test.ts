// @vitest-environment jsdom

import React, { act } from 'react'
import { SWRConfig } from 'swr'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProfilePage from '@/app/(dashboard)/profile/page'
import { apiSWRConfig } from '@/lib/apiData'
import { useAuthStore } from '@/lib/store'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
    patch: mocks.apiPatch,
    post: mocks.apiPost,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

type MockProfileUser = {
  full_name?: string
  avatar_url?: string
  banner_url?: string
}

type MockProfileDraft = {
  full_name: string
  level?: string
  track?: string
  avatar_url?: string
  banner_url?: string
}

type MockProfileProps = {
  user?: MockProfileUser | null
  xp?: { total_xp?: number } | null
  stats?: { itemsCompleted?: number } | null
  subjects: unknown[]
  notes: unknown[]
  saves: unknown[]
  sidebar: { leaderboardEntries?: unknown[] }
  onSaveProfile?: (draft: MockProfileDraft) => Promise<void> | void
  onSelectMedia?: (kind: 'avatar' | 'banner', draft: MockProfileDraft) => Promise<string | undefined> | string | undefined
}

vi.mock('@/components/figma', () => ({
  FigmaProfile: (props: MockProfileProps) => React.createElement(
    'main',
    { 'data-testid': 'profile-shell' },
    React.createElement('h1', null, `Profile shell ${props.user?.full_name ?? 'missing'}`),
    React.createElement('p', null, `Avatar ${props.user?.avatar_url ?? 'none'}`),
    React.createElement('p', null, `XP ${props.xp?.total_xp ?? 'none'}`),
    React.createElement('p', null, `Lessons ${props.stats?.itemsCompleted ?? 'none'}`),
    React.createElement('p', null, `Subjects ${props.subjects.length}`),
    React.createElement('p', null, `Notes ${props.notes.length}`),
    React.createElement('p', null, `Saves ${props.saves.length}`),
    React.createElement('p', null, `Sidebar leaders ${props.sidebar.leaderboardEntries?.length ?? 0}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          void Promise.resolve(props.onSaveProfile?.({
            full_name: 'Saved Student',
            level: '2BAC',
            track: 'Sciences Math B',
            avatar_url: props.user?.avatar_url ?? '',
            banner_url: props.user?.banner_url ?? '',
          })).catch(() => undefined)
        },
      },
      'Save mocked profile',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          void Promise.resolve(props.onSelectMedia?.('avatar', {
            full_name: props.user?.full_name ?? 'Kresco Student',
            level: '2BAC',
            track: 'Sciences Math B',
            avatar_url: props.user?.avatar_url ?? '',
            banner_url: props.user?.banner_url ?? '',
          })).catch(() => undefined)
        },
      },
      'Upload mocked avatar',
    ),
  ),
  toProfileSubject: (title: string, progress: number | undefined, index: number) => ({
    key: `${title.toLowerCase()}-${index}`,
    title,
    score: progress ?? 0,
    caption: 'test subject',
    tone: '#000000',
  }),
}))

vi.mock('@/components/figma/skeletons', () => ({
  FigmaProfileSkeleton: () => React.createElement('div', null, 'Profile skeleton'),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profileUser = {
  id: 1,
  email: 'student@kresco.local',
  full_name: 'Kresco Student',
  avatar_url: '',
  banner_url: '',
  role: 'student',
  is_staff: false,
  is_pro: true,
  niveau: '2BAC',
  filiere: 'Sciences Math B',
  is_email_verified: true,
  created_at: '2026-05-01T00:00:00Z',
}

const cachedUser = {
  ...profileUser,
  full_name: 'Cached Student',
}

const endpointData: Record<string, unknown> = {
  '/profile/me': profileUser,
  '/progress/xp': {
    total_xp: 1234,
    level: 4,
    streak_days: 5,
  },
  '/progress/stats': {
    total_watch_minutes: 90,
    quizzes_passed: 3,
    items_completed: 7,
    is_pro: true,
  },
  '/courses/subjects': [
    { id: 1, title: 'Math', progress_pct: 80 },
  ],
  '/courses/topics': [
    { id: 10, subject_title: 'Math', progress_pct: 80 },
  ],
  '/interactions/notes': [
    { id: 1, body: 'Review limits' },
  ],
  '/interactions/saves': [
    { id: 1, target_type: 'topic_item', target_id: 10 },
  ],
  '/progress/sidebar-summary': {
    leaderboard_entries: [{ rank: 1, user_id: 1, full_name: 'Peer', total_xp: 900 }],
  },
}

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoots = []
  useAuthStore.setState({
    user: cachedUser,
    token: 'cookie-session',
    isHydrated: true,
  })
  mocks.apiGet.mockImplementation(async (url: string) => ({ data: endpointData[url] }))
  mocks.apiPatch.mockResolvedValue({ data: profileUser })
  mocks.apiPost.mockResolvedValue({ data: { url: 's3://kresco-test/avatar.png' } })
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

describe('Profile page SWR data behavior', () => {
  it('loads profile data through shared SWR keys and renders partial dashboard inputs', async () => {
    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Kresco Student')
      expect(container.textContent).toContain('XP 1234')
      expect(container.textContent).toContain('Lessons 7')
      expect(container.textContent).toContain('Subjects 1')
      expect(container.textContent).toContain('Notes 1')
      expect(container.textContent).toContain('Saves 1')
      expect(container.textContent).toContain('Sidebar leaders 1')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/profile/me')
    expect(mocks.apiGet).toHaveBeenCalledWith('/progress/sidebar-summary')
    expect(useAuthStore.getState().user?.full_name).toBe('Kresco Student')
  })

  it('keeps cached auth state intact when profile refresh fails but other data resolves', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/profile/me') {
        throw { response: { status: 500, data: { detail: 'Controlled profile failure' } } }
      }
      return { data: endpointData[url] }
    })

    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile data could not be refreshed.')
      expect(container.textContent).toContain('Profile shell Cached Student')
      expect(container.textContent).toContain('XP 1234')
    })
    expect(mocks.toastError).toHaveBeenCalledWith('Controlled profile failure')
    expect(useAuthStore.getState().user?.full_name).toBe('Cached Student')
    expect(useAuthStore.getState().token).toBe('cookie-session')
  })

  it('retries from profile error to fresh profile data without clearing auth', async () => {
    let profileCalls = 0
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/profile/me') {
        profileCalls += 1
        if (profileCalls === 1) {
          throw { response: { status: 500, data: { detail: 'First profile failure' } } }
        }
      }
      return { data: endpointData[url] }
    })

    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile data could not be refreshed.')
    })

    await act(async () => {
      getButton(container, 'Retry profile data').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Kresco Student')
    })
    expect(profileCalls).toBe(2)
    expect(useAuthStore.getState().token).toBe('cookie-session')
  })

  it('reports the same profile API failure again after a successful recovery', async () => {
    let profileShouldFail = true
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/profile/me') {
        if (profileShouldFail) {
          throw { response: { status: 500, data: { detail: 'Repeated profile failure' } } }
        }
        return { data: profileUser }
      }
      return { data: endpointData[url] }
    })

    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile data could not be refreshed.')
    })
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenLastCalledWith('Repeated profile failure')

    profileShouldFail = false
    await act(async () => {
      getButton(container, 'Retry profile data').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Kresco Student')
      expect(container.textContent).not.toContain('Profile data could not be refreshed.')
    })

    profileShouldFail = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledTimes(2)
    })
    expect(mocks.toastError).toHaveBeenLastCalledWith('Repeated profile failure')
  })

  it('writes a saved profile refresh back into SWR and the auth store', async () => {
    let currentProfile = profileUser
    const savedProfile = {
      ...profileUser,
      full_name: 'Saved Student',
    }
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/profile/me') return { data: currentProfile }
      return { data: endpointData[url] }
    })
    mocks.apiPatch.mockImplementation(async (_url: string, payload: Partial<typeof profileUser>) => {
      currentProfile = { ...savedProfile, ...payload }
      return { data: currentProfile }
    })

    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Kresco Student')
    })
    await act(async () => {
      getButton(container, 'Save mocked profile').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Saved Student')
    })
    expect(mocks.apiPatch).toHaveBeenCalledWith('/profile/me', {
      full_name: 'Saved Student',
      niveau: '2BAC',
      filiere: 'Sciences Math B',
    })
    expect(useAuthStore.getState().user?.full_name).toBe('Saved Student')
  })

  it('keeps the cached profile intact when saving fails', async () => {
    mocks.apiPatch.mockRejectedValue({ response: { status: 500, data: { detail: 'Save profile failed' } } })

    const { container } = renderProfilePage()

    await waitFor(() => {
      expect(container.textContent).toContain('Profile shell Kresco Student')
    })
    await act(async () => {
      getButton(container, 'Save mocked profile').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Save profile failed')
    })
    expect(container.textContent).toContain('Profile shell Kresco Student')
    expect(useAuthStore.getState().user?.full_name).toBe('Kresco Student')
  })

  it('keeps uploaded avatar cache state through save without resending the uploaded URL', async () => {
    const uploadedAvatarUrl = 's3://kresco-test/avatar.png'
    let currentProfile = { ...profileUser }
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/profile/me') return { data: currentProfile }
      return { data: endpointData[url] }
    })
    mocks.apiPost.mockImplementation(async () => {
      currentProfile = { ...currentProfile, avatar_url: uploadedAvatarUrl }
      return { data: { avatar_url: uploadedAvatarUrl } }
    })
    mocks.apiPatch.mockImplementation(async (_url: string, payload: Partial<typeof profileUser>) => {
      currentProfile = { ...currentProfile, ...payload }
      return { data: currentProfile }
    })
    const restoreFilePicker = mockImageFileSelection()

    try {
      const { container } = renderProfilePage()

      await waitFor(() => {
        expect(container.textContent).toContain('Profile shell Kresco Student')
      })
      await act(async () => {
        getButton(container, 'Upload mocked avatar').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await waitFor(() => {
        expect(container.textContent).toContain(`Avatar ${uploadedAvatarUrl}`)
      })

      await act(async () => {
        getButton(container, 'Save mocked profile').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await waitFor(() => {
        expect(mocks.apiPatch).toHaveBeenCalled()
      })
      expect(mocks.apiPatch.mock.calls.at(-1)?.[1]).toEqual({
        full_name: 'Saved Student',
        niveau: '2BAC',
        filiere: 'Sciences Math B',
      })
      expect(container.textContent).toContain(`Avatar ${uploadedAvatarUrl}`)
    } finally {
      restoreFilePicker()
    }
  })

  it('can reuse cached profile data across remounts with the same SWR cache', async () => {
    const cache = new Map()
    const first = renderProfilePage(cache)

    await waitFor(() => {
      expect(first.container.textContent).toContain('Profile shell Kresco Student')
    })
    expect(mocks.apiGet).toHaveBeenCalled()
    const callCount = mocks.apiGet.mock.calls.length

    act(() => {
      first.root.unmount()
    })
    first.container.remove()
    mountedRoots = mountedRoots.filter((entry) => entry.root !== first.root)

    mocks.apiGet.mockImplementation(() => new Promise(() => undefined))
    const second = renderProfilePage(cache, { revalidateIfStale: false })

    expect(second.container.textContent).toContain('Profile shell Kresco Student')
    expect(mocks.apiGet).toHaveBeenCalledTimes(callCount)
  })
})

function renderProfilePage(cache = new Map(), swrOverrides: Record<string, unknown> = {}) {
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
      React.createElement(ProfilePage),
    ))
  })

  return { container, root }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
}

function mockImageFileSelection() {
  const originalCreateElement = document.createElement.bind(document)
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options)
    if (tagName.toLowerCase() === 'input') {
      const input = element as HTMLInputElement
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['profile'], 'profile.png', { type: 'image/png' })],
      })
      input.click = () => {
        input.onchange?.(new Event('change'))
      }
    }
    return element
  }) as typeof document.createElement)

  return () => createElementSpy.mockRestore()
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
