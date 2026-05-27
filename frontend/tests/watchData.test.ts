// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  useWatchData,
  watchAccessSWRKey,
  watchContextSWRKey,
  watchPdfsSWRKey,
} from '@/lib/watchData'
import type { WatchContext, WatchSectionType } from '@/lib/watchViewModel'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

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

describe('watch SWR data', () => {
  it('builds route data keys defensively and only loads PDFs for video contexts', () => {
    const videoContext = watchContextFixture(101, 'Mock video section', 'video')
    const textContext = watchContextFixture(202, 'Mock text section', 'text')

    expect(watchContextSWRKey('101')).toBe('/courses/sections/101/watch-context')
    expect(watchAccessSWRKey('101')).toBe('/progress/sections/101/access')
    expect(watchPdfsSWRKey('101', videoContext)).toBe('/courses/lessons/101/pdfs')
    expect(watchPdfsSWRKey('202', textContext)).toBeNull()
    expect(watchContextSWRKey('not-a-section')).toBeNull()
  })

  it('keeps context visible when optional access and PDF requests fail', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/sections/101/watch-context') return { data: watchContextFixture(101, 'Mock video section', 'video') }
      if (url === '/progress/sections/101/access') throw { response: { status: 503 } }
      if (url === '/courses/lessons/101/pdfs') throw { response: { status: 503 } }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderWatchHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('title: Mock video section')
      expect(container.textContent).toContain('context error: no')
      expect(container.textContent).toContain('access error: yes')
      expect(container.textContent).toContain('pdf count: 0')
    })
  })

  it('does not expose previous section context after the route section id changes', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/courses/sections/101/watch-context') return { data: watchContextFixture(101, 'First section', 'text') }
      if (url === '/progress/sections/101/access') return { data: { can_access: true } }
      if (url === '/courses/sections/202/watch-context') return new Promise(() => undefined)
      if (url === '/progress/sections/202/access') return { data: { can_access: true } }
      throw new Error(`unexpected url ${url}`)
    })

    const { container } = renderWatchHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('title: First section')
    })

    await act(async () => {
      getButton(container, 'Go section 202').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('title: none')
    expect(container.textContent).toContain('loading: yes')
  })
})

function WatchHarness() {
  const [sectionId, setSectionId] = useState('101')
  const { context, contextError, accessError, pdfs, loading } = useWatchData(sectionId)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `title: ${context?.section.title ?? 'none'}`),
    React.createElement('p', null, `context error: ${contextError ? 'yes' : 'no'}`),
    React.createElement('p', null, `access error: ${accessError ? 'yes' : 'no'}`),
    React.createElement('p', null, `pdf count: ${pdfs.length}`),
    React.createElement('p', null, `loading: ${loading ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setSectionId('202'),
      },
      'Go section 202',
    ),
  )
}

function renderWatchHarness() {
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
          provider: () => new Map(),
          dedupingInterval: 0,
          errorRetryCount: 0,
        },
      },
      React.createElement(WatchHarness),
    ))
  })

  return { container, root }
}

function watchContextFixture(id: number, title: string, sectionType: WatchSectionType): WatchContext {
  const section = {
    id,
    title,
    section_type: sectionType,
    order: 1,
    chapter_id: 7,
    duration_seconds: 120,
  }
  const chapter = {
    id: 7,
    title: 'Limits',
    order: 1,
    sections: [section],
  }

  return {
    section,
    chapter,
    subject_id: 3,
    subject_title: 'Math',
    chapters: [chapter],
  }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
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
