import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasTopicWorkspaceResourceUrl,
  resolveTopicWorkspaceResourceUrl,
  resolvedTopicWorkspaceResourceUrl,
  topicWorkspaceResourceOpenEndpointCandidates,
} from '@/lib/topicWorkspaceResources'
import type { Resource } from '@/lib/topicWorkspaceViewModel'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    post: mocks.apiPost,
  },
}))

const resource: Resource = {
  id: 22,
  title: 'Worksheet PDF',
  resource_type: 'pdf',
  provider: 'local',
  provider_resource_id: '',
  url: '/worksheet.pdf',
  summary: 'Practice worksheet',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('topic workspace resource helpers', () => {
  it('knows when a resource can expose file actions', () => {
    expect(hasTopicWorkspaceResourceUrl(resource)).toBe(true)
    expect(hasTopicWorkspaceResourceUrl({ ...resource, url: '   ' })).toBe(false)
  })

  it('prefers the backend-provided action URL when a resource-open endpoint exists', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      data: {
        preview_url: 'https://signed.example/preview.pdf',
      },
    })

    await expect(resolveTopicWorkspaceResourceUrl(resource, 'preview', {
      topic_item_id: 101,
      tab_content_id: 12,
    })).resolves.toBe('https://signed.example/preview.pdf')
    expect(mocks.apiPost).toHaveBeenCalledWith('/courses/resources/22/open', {
      topic_item_id: 101,
      tab_content_id: 12,
    })
  })

  it('falls back to the raw resource URL when open endpoints are unavailable', async () => {
    mocks.apiPost
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockRejectedValueOnce({ response: { status: 405 } })

    await expect(resolveTopicWorkspaceResourceUrl(resource, 'open')).resolves.toBe('/worksheet.pdf')
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/courses/resources/22/open', {})
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/resources/22/open', {})
  })

  it('normalizes open-endpoint response shapes and candidate order', () => {
    expect(topicWorkspaceResourceOpenEndpointCandidates(5)).toEqual([
      '/courses/resources/5/open',
      '/resources/5/open',
    ])
    expect(resolvedTopicWorkspaceResourceUrl({ download_url: 'https://signed.example/file.pdf' }, resource, 'download')).toBe('https://signed.example/file.pdf')
    expect(resolvedTopicWorkspaceResourceUrl({ href: 'https://signed.example/open.pdf' }, resource, 'open')).toBe('https://signed.example/open.pdf')
    expect(resolvedTopicWorkspaceResourceUrl(null, resource, 'open')).toBe('/worksheet.pdf')
  })

  it('drops non-navigation URLs from provider responses and fallbacks', async () => {
    expect(resolvedTopicWorkspaceResourceUrl({ open_url: 'javascript:alert(1)' }, resource, 'open')).toBe('')
    expect(resolvedTopicWorkspaceResourceUrl(null, { ...resource, url: 'data:text/html,phish' }, 'open')).toBe('')

    mocks.apiPost
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockRejectedValueOnce({ response: { status: 405 } })

    await expect(resolveTopicWorkspaceResourceUrl({ ...resource, url: 'blob:https://evil.example/file' }, 'open')).resolves.toBe('')
  })
})
