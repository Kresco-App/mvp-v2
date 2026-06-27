// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  flushPendingZedStorageWrites,
  zedStorageGetItem,
  zedStorageRemoveItem,
  zedStorageRemoveItemDeferred,
  zedStorageSetItem,
  zedStorageSetItemDeferred,
} from '@/components/zed/zedStorage'

const STORAGE_KEY = 'kresco:zed:test'
const LEGACY_STORAGE_KEY = 'kresco_zed_test'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  flushPendingZedStorageWrites()
  vi.restoreAllMocks()
})

describe('Zed storage cache', () => {
  it('reuses values written through the helper without rereading localStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    zedStorageSetItem(STORAGE_KEY, 'one')
    expect(zedStorageGetItem(STORAGE_KEY)).toBe('one')
    const callsAfterFirstRead = getItemSpy.mock.calls.length

    expect(zedStorageGetItem(STORAGE_KEY)).toBe('one')
    expect(getItemSpy.mock.calls.length).toBe(callsAfterFirstRead)

    zedStorageSetItem(STORAGE_KEY, 'two')
    expect(zedStorageGetItem(STORAGE_KEY)).toBe('two')
    expect(getItemSpy.mock.calls.length).toBe(callsAfterFirstRead)

    zedStorageRemoveItem(STORAGE_KEY)
    expect(zedStorageGetItem(STORAGE_KEY)).toBeNull()
    expect(getItemSpy.mock.calls.length).toBe(callsAfterFirstRead)
  })

  it('migrates a legacy value once and serves the migrated value from cache', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'legacy-value')
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    expect(zedStorageGetItem(STORAGE_KEY, LEGACY_STORAGE_KEY)).toBe('legacy-value')
    const callsAfterMigration = getItemSpy.mock.calls.length

    expect(zedStorageGetItem(STORAGE_KEY, LEGACY_STORAGE_KEY)).toBe('legacy-value')
    expect(getItemSpy.mock.calls.length).toBe(callsAfterMigration)

    getItemSpy.mockRestore()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('legacy-value')
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
  })

  it('invalidates cached values when another tab changes the same key', () => {
    zedStorageSetItem(STORAGE_KEY, 'cached')
    expect(zedStorageGetItem(STORAGE_KEY)).toBe('cached')

    localStorage.setItem(STORAGE_KEY, 'external')
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEY,
      oldValue: 'cached',
      newValue: 'external',
      storageArea: localStorage,
    }))

    expect(zedStorageGetItem(STORAGE_KEY)).toBe('external')
  })

  it('invalidates cached values after direct storage changes alter localStorage length', () => {
    zedStorageSetItem(STORAGE_KEY, 'cached')
    expect(zedStorageGetItem(STORAGE_KEY)).toBe('cached')

    localStorage.setItem('kresco:zed:other-test', 'other')
    localStorage.setItem(STORAGE_KEY, 'direct')

    expect(zedStorageGetItem(STORAGE_KEY)).toBe('direct')
  })

  it('keeps deferred writes readable without blocking the input path', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    zedStorageSetItemDeferred(STORAGE_KEY, 'queued')

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(zedStorageGetItem(STORAGE_KEY)).toBe('queued')
    expect(setItemSpy).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pagehide'))

    expect(localStorage.getItem(STORAGE_KEY)).toBe('queued')

    zedStorageRemoveItemDeferred(STORAGE_KEY)
    expect(zedStorageGetItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('queued')

    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
