// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminVideoFeedbackPage from '@/app/admin/reviews/video-feedback/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(videoFeedbackFixture)
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('AdminReviewsPage', () => {
  it('shows sortable video ratings with positive and negative comments', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Video feedback')
      expect(container.textContent).toContain('Average ratings per video')
      expect(container.textContent).toContain('Reviewed videos')
      expect(container.textContent).toContain('2 watchlist')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/video-feedback?limit=120')
    })

    expect(videoRows(container)[0].textContent).toContain('Implicit differentiation video')
    expect(container.textContent).toContain('Too fast near the chain rule.')
    expect(container.textContent).toContain('The final example helped.')
    const sortControl = container.querySelector<HTMLElement>('[data-video-feedback-sort-control]')
    expect(sortControl?.className).toContain('shadow-[var(--shadow-border)]')
    expect(sortControl?.className).toContain('focus-within:ring-4')
    expect(sortControl?.textContent).toContain('Needs attention')

    setSelectValue(container, 'select[aria-label="Sort video feedback"]', 'best_rating')

    await waitFor(() => {
      expect(videoRows(container)[0].textContent).toContain('Limits intro video')
      expect(sortControl?.textContent).toContain('Best rating')
    })

    setInputValue(container, 'input[aria-label="Search video feedback"]', 'implicit')

    await waitFor(() => {
      const rows = videoRows(container)
      expect(rows).toHaveLength(1)
      expect(rows[0].textContent).toContain('Implicit differentiation video')
      expect(container.textContent).not.toContain('Limits intro video')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminVideoFeedbackPage))
  })

  return { container, root }
}

function videoRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-video-feedback-row]'))
}

function setInputValue(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`input not found: ${selector}`)
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function setSelectValue(container: HTMLElement, selector: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(selector)
  if (!select) throw new Error(`select not found: ${selector}`)
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 40; index += 1) {
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

const videoFeedbackFixture = {
  generated_at: '2026-06-27T10:00:00Z',
  summary: {
    videos_reviewed: 3,
    rated_comments: 9,
    average_rating: 3.7,
    positive_comments: 5,
    negative_comments: 3,
    watchlist_videos: 2,
  },
  items: [
    {
      topic_item_id: 10,
      title: 'Implicit differentiation video',
      topic_title: 'Derivatives',
      subject_title: 'Mathematics',
      item_type: 'lesson_video',
      duration_seconds: 900,
      resource_provider: 'vdocipher',
      resource_url: '',
      rating_count: 4,
      average_rating: 2.8,
      positive_count: 1,
      negative_count: 2,
      neutral_count: 1,
      latest_comment_at: '2026-06-26T10:00:00Z',
      negative_comments: [
        {
          comment_id: 101,
          author_name: 'Sara Benali',
          body: 'Too fast near the chain rule.',
          rating: 2,
          created_at: '2026-06-26T10:00:00Z',
        },
      ],
      positive_comments: [
        {
          comment_id: 102,
          author_name: 'Nora Basic',
          body: 'The final example helped.',
          rating: 5,
          created_at: '2026-06-26T10:05:00Z',
        },
      ],
    },
    {
      topic_item_id: 11,
      title: 'Limits intro video',
      topic_title: 'Limits',
      subject_title: 'Mathematics',
      item_type: 'video',
      duration_seconds: 600,
      resource_provider: 'youtube',
      resource_url: '',
      rating_count: 3,
      average_rating: 4.8,
      positive_count: 3,
      negative_count: 0,
      neutral_count: 0,
      latest_comment_at: '2026-06-25T10:00:00Z',
      negative_comments: [],
      positive_comments: [
        {
          comment_id: 201,
          author_name: 'Kresco Student',
          body: 'Clear pacing.',
          rating: 5,
          created_at: '2026-06-25T10:00:00Z',
        },
      ],
    },
    {
      topic_item_id: 12,
      title: 'Geometry proof video',
      topic_title: 'Geometry',
      subject_title: 'Mathematics',
      item_type: 'video',
      duration_seconds: 720,
      resource_provider: 'vdocipher',
      resource_url: '',
      rating_count: 2,
      average_rating: 3.2,
      positive_count: 1,
      negative_count: 1,
      neutral_count: 0,
      latest_comment_at: '2026-06-24T10:00:00Z',
      negative_comments: [],
      positive_comments: [],
    },
  ],
}
