// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiSWRConfig } from '@/lib/apiData'
import {
  topicWorkspaceSWRKey,
  useTopicWorkspaceData,
  type TopicWorkspaceDataRequest,
} from '@/lib/topicWorkspaceData'
import {
  topicWorkspaceQueryTargetsFromItemId,
  type TopicWorkspace,
} from '@/lib/topicWorkspaceViewModel'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const baseWorkspace = workspaceFixture('Continuity introduction')
const searchWorkspace = workspaceFixture('Limits search result')

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

describe('topic workspace SWR data', () => {
  it('builds stable workspace keys from topic, item, and search query inputs', () => {
    expect(topicWorkspaceSWRKey(42, topicWorkspaceQueryTargetsFromItemId(null), '')).toBe('/courses/topics/42/workspace')
    expect(topicWorkspaceSWRKey(42, topicWorkspaceQueryTargetsFromItemId(7), ' limits ')).toBe('/courses/topics/42/workspace?item_id=7&q=limits')
    expect(topicWorkspaceSWRKey(null, topicWorkspaceQueryTargetsFromItemId(7), 'limits')).toBeNull()
  })

  it('keeps previous workspace data visible while a new workspace query fails and retries', async () => {
    let searchShouldFail = true
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url.includes('q=limits')) {
        if (searchShouldFail) {
          throw { response: { status: 500, data: { detail: 'Controlled topic search failure' } } }
        }
        return { data: searchWorkspace }
      }
      return { data: baseWorkspace }
    })

    const { container } = renderTopicWorkspaceHarness()

    await waitFor(() => {
      expect(container.textContent).toContain('title: Continuity introduction')
      expect(container.textContent).toContain('loading: no')
    })

    await act(async () => {
      getButton(container, 'Search limits').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('title: Continuity introduction')
      expect(container.textContent).toContain('error: yes')
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/courses/topics/42/workspace?item_id=7&q=limits')

    searchShouldFail = false
    await act(async () => {
      getButton(container, 'Retry').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => {
      expect(container.textContent).toContain('title: Limits search result')
      expect(container.textContent).toContain('error: no')
    })
  })
})

function TopicWorkspaceHarness() {
  const [request, setRequest] = useState<TopicWorkspaceDataRequest>({
    targets: topicWorkspaceQueryTargetsFromItemId(null),
    q: '',
  })
  const { workspace, error, loading, mutate } = useTopicWorkspaceData('42', request)

  return React.createElement(
    'main',
    null,
    React.createElement('p', null, `title: ${workspace?.active_item?.title ?? 'none'}`),
    React.createElement('p', null, `error: ${error ? 'yes' : 'no'}`),
    React.createElement('p', null, `loading: ${loading ? 'yes' : 'no'}`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setRequest({
          targets: topicWorkspaceQueryTargetsFromItemId(7),
          q: 'limits',
          preserveActiveTab: true,
          preserveOpenSections: true,
        }),
      },
      'Search limits',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          void mutate()
        },
      },
      'Retry',
    ),
  )
}

function renderTopicWorkspaceHarness() {
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
      React.createElement(TopicWorkspaceHarness),
    ))
  })

  return { container, root }
}

function workspaceFixture(title: string): TopicWorkspace {
  return {
    id: 42,
    subject_title: 'Math',
    title: 'Continuity',
    description: 'Core topic',
    progress_pct: 40,
    completed_count: 1,
    item_count: 2,
    active_item_id: 7,
    active_item: {
      id: 7,
      topic_id: 42,
      section_id: 5,
      title,
      description: 'Lesson summary',
      item_type: 'lesson',
      renderer_key: '',
      duration_seconds: 300,
      progress_status: 'in_progress',
      primary_resource: null,
      primary_tab_content_id: null,
      tabs: [],
    },
    sections: [
      {
        id: 5,
        title: 'Lessons',
        section_type: 'lesson',
        order: 1,
        items: [],
      },
    ],
    search_results: [],
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
