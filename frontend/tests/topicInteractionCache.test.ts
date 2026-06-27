// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TOPIC_INTERACTION_CACHE_TTL_MS,
  clearTopicInteractionCache,
  deleteTopicInteractionCache,
  flushPendingTopicInteractionSessionCacheWrites,
  getTopicInteractionData,
  readTopicInteractionCache,
  topicInteractionSessionStorageKey,
  writeTopicInteractionCache,
} from '@/lib/topicInteractionCache'

beforeEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
  clearTopicInteractionCache()
})

describe('topic interaction cache', () => {
  it('hydrates cached topic interactions from session storage before fetching', async () => {
    const key = 'topic-comments:101'
    const comments = [{ id: 1, body: 'Cached comment' }]
    sessionStorage.setItem(topicInteractionSessionStorageKey(key), JSON.stringify({
      cachedAt: Date.now(),
      data: comments,
    }))
    const load = vi.fn()

    await expect(getTopicInteractionData(key, load)).resolves.toEqual(comments)

    expect(load).not.toHaveBeenCalled()
    expect(readTopicInteractionCache<typeof comments>(key)).toEqual({
      hit: true,
      data: comments,
    })
  })

  it('lazily hydrates only the requested topic interaction session entry', () => {
    const commentsKey = 'topic-comments:101'
    const repliesKey = 'topic-comment-replies:101:7'
    const comments = [{ id: 1, body: 'Requested comment' }]
    sessionStorage.setItem(topicInteractionSessionStorageKey(commentsKey), JSON.stringify({
      cachedAt: Date.now(),
      data: comments,
    }))
    sessionStorage.setItem(topicInteractionSessionStorageKey(repliesKey), JSON.stringify({
      cachedAt: Date.now(),
      data: [{ id: 7, body: 'Unrequested reply' }],
    }))
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    const keySpy = vi.spyOn(Storage.prototype, 'key')

    try {
      expect(readTopicInteractionCache<typeof comments>(commentsKey)).toEqual({
        hit: true,
        data: comments,
      })
      expect(getItemSpy).toHaveBeenCalledWith(topicInteractionSessionStorageKey(commentsKey))
      expect(getItemSpy).not.toHaveBeenCalledWith(topicInteractionSessionStorageKey(repliesKey))
      expect(keySpy).not.toHaveBeenCalled()
      expect(readTopicInteractionCache(repliesKey)).toEqual({
        hit: true,
        data: [{ id: 7, body: 'Unrequested reply' }],
      })
    } finally {
      getItemSpy.mockRestore()
      keySpy.mockRestore()
    }
  })

  it('persists written topic interactions for same-tab return navigation', () => {
    const key = 'topic-item-save:101'
    const save = { id: 88, target_type: 'topic_item', target_id: 101 }

    writeTopicInteractionCache(key, save)
    flushPendingTopicInteractionSessionCacheWrites()

    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toContain('topic_item')
    expect(readTopicInteractionCache<typeof save>(key)).toEqual({
      hit: true,
      data: save,
    })
  })

  it('keeps writes off the interaction path until an idle or pagehide flush', () => {
    const key = 'topic-comments:101'
    const comments = [{ id: 1, body: 'Cached comment' }]

    writeTopicInteractionCache(key, comments)

    expect(readTopicInteractionCache<typeof comments>(key)).toEqual({
      hit: true,
      data: comments,
    })
    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toBeNull()

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toContain('Cached comment')
  })

  it('does not rehydrate deleted topic interactions before deferred storage delete flushes', () => {
    const key = 'topic-item-save:101'
    sessionStorage.setItem(topicInteractionSessionStorageKey(key), JSON.stringify({
      cachedAt: Date.now(),
      data: { id: 88, target_type: 'topic_item', target_id: 101 },
    }))

    deleteTopicInteractionCache(key)

    expect(readTopicInteractionCache(key)).toEqual({ hit: false })
    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toContain('topic_item')

    flushPendingTopicInteractionSessionCacheWrites()

    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toBeNull()
  })

  it('expires stale session-backed topic interactions', () => {
    const key = 'topic-comment-replies:101:7'
    sessionStorage.setItem(topicInteractionSessionStorageKey(key), JSON.stringify({
      cachedAt: Date.now() - TOPIC_INTERACTION_CACHE_TTL_MS - 1,
      data: [{ id: 7 }],
    }))

    expect(readTopicInteractionCache(key)).toEqual({ hit: false })
    expect(sessionStorage.getItem(topicInteractionSessionStorageKey(key))).toBeNull()
  })

  it('clears only versioned topic interaction session entries', () => {
    const key = topicInteractionSessionStorageKey('topic-comments:101')
    sessionStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now(),
      data: [],
    }))
    sessionStorage.setItem('kresco:other-cache:v1:topic-comments:101', 'keep')

    clearTopicInteractionCache()

    expect(sessionStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem('kresco:other-cache:v1:topic-comments:101')).toBe('keep')
  })
})
