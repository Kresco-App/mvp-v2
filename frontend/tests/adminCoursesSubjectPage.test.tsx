// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminSubjectPage from '@/app/admin/courses/[subjectId]/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ subjectId: '42' }),
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null
let topicWorkspaceShouldFail = true

const subjectFixture = {
  id: 42,
  title: 'Mathematics',
  description: 'Core math course',
}

const topicsFixture = [
  {
    id: 7,
    title: 'Continuity',
    order: 1,
  },
]

const workspaceFixture = {
  sections: [
    {
      id: 99,
      title: 'Lesson section',
      section_type: 'lesson',
      order: 1,
      items: [
        {
          id: 501,
          title: 'Slope overview',
          item_type: 'video',
          order: 1,
          is_free_preview: true,
        },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  topicWorkspaceShouldFail = true
  mocks.getJson.mockImplementation(async (url: string) => {
    if (url === '/courses/subjects/42') return subjectFixture
    if (url === '/courses/subjects/42/topics') return topicsFixture
    if (url === '/courses/topics/7/workspace') {
      if (topicWorkspaceShouldFail) {
        throw { response: { status: 500 } }
      }
      return workspaceFixture
    }
    throw new Error(`Unexpected API request: ${url}`)
  })
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('AdminSubjectPage topic loading', () => {
  it('keeps failed topic fetches retryable instead of caching an empty section list', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Mathematics')
      expect(container.textContent).toContain('Continuity')
      expect(container.textContent).toContain('Carte de contenu')
    })

    clickButton(container, 'Continuity')

    await waitFor(() => {
      expect(container.textContent).toContain('Impossible de charger les sections de ce topic.')
      expect(container.textContent).toContain('1 topic(s) à recharger')
    })
    expect(mocks.getJson).toHaveBeenCalledWith('/courses/topics/7/workspace')
    expect(container.textContent).not.toContain('Aucun item dans ce topic')

    topicWorkspaceShouldFail = false
    clickButton(container, 'Reessayer')

    await waitFor(() => {
      expect(container.textContent).toContain('Slope overview')
      expect(container.textContent).toContain('Apercu')
      expect(container.textContent).toContain('Vidéo: 1')
    })

    const editorLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find((link) => (
      link.getAttribute('aria-label') === 'Modifier le cours Slope overview'
    ))
    expect(editorLink).not.toBeNull()
    expect(editorLink?.getAttribute('href')).toBe('/admin/courses/content?subjectId=42&topicId=7&itemId=501')
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminSubjectPage))
  })

  return { container, root }
}

function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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
