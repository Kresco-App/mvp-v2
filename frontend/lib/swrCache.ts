import { unstable_serialize } from 'swr'
import type { Cache, Key, State } from 'swr'

export type ReadableSWRCache = Pick<Cache<unknown>, 'get'>

export function hasSuccessfulSWRCacheData(key: Key, cache?: ReadableSWRCache) {
  return readSuccessfulSWRCacheData(key, cache) !== undefined
}

export function readSuccessfulSWRCacheData(key: Key, cache?: ReadableSWRCache) {
  if (!cache) return undefined

  let state: State<unknown> | undefined
  try {
    const serializedKey = typeof unstable_serialize === 'function' ? unstable_serialize(key) : ''
    if (serializedKey) state = cache.get(serializedKey) as State<unknown> | undefined
  } catch {
    state = undefined
  }

  if (!state && typeof key === 'string') {
    state = cache.get(key) as State<unknown> | undefined
  }

  if (!state || state.error || state.data === undefined) return undefined
  return state.data
}
