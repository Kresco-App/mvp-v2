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
    const serializedKey = unstable_serialize(key)
    if (!serializedKey) return undefined
    state = cache.get(serializedKey) as State<unknown> | undefined
  } catch {
    return undefined
  }

  if (!state || state.error || state.data === undefined) return undefined
  return state.data
}
