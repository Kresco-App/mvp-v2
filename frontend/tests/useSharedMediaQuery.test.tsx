// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSharedMediaQuery } from '@/hooks/useSharedMediaQuery'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mediaQueries = new Map<string, MockMediaQueryList>()

class MockMediaQueryList {
  matches: boolean
  readonly media: string
  readonly listeners = new Set<(event: MediaQueryListEvent) => void>()
  readonly addEventListener = vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
    this.listeners.add(listener)
  })
  readonly removeEventListener = vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
    this.listeners.delete(listener)
  })
  readonly addListener = vi.fn()
  readonly removeListener = vi.fn()
  onchange: ((event: MediaQueryListEvent) => void) | null = null

  constructor(media: string, matches = false) {
    this.media = media
    this.matches = matches
  }

  dispatch(matches: boolean) {
    this.matches = matches
    const event = { matches, media: this.media } as MediaQueryListEvent
    for (const listener of Array.from(this.listeners)) listener(event)
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  mediaQueries.clear()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    let mediaQuery = mediaQueries.get(query)
    if (!mediaQuery) {
      mediaQuery = new MockMediaQueryList(query)
      mediaQueries.set(query, mediaQuery)
    }
    return mediaQuery
  }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

describe('useSharedMediaQuery', () => {
  it('shares one media query listener across subscribers for the same query', () => {
    act(() => {
      root?.render(
        <>
          <MediaProbe label="alpha" />
          <MediaProbe label="beta" />
        </>,
      )
    })

    const matchMediaMock = window.matchMedia as unknown as ReturnType<typeof vi.fn>
    const mediaQuery = mediaQueries.get('(min-width: 1181px)')!

    expect(matchMediaMock).toHaveBeenCalledTimes(1)
    expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1)
    expect(container?.textContent).toContain('alpha:narrow')
    expect(container?.textContent).toContain('beta:narrow')

    act(() => {
      mediaQuery.dispatch(true)
    })

    expect(container?.textContent).toContain('alpha:wide')
    expect(container?.textContent).toContain('beta:wide')

    act(() => {
      root?.unmount()
    })
    root = null

    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1)
  })
})

function MediaProbe({ label }: { label: string }) {
  const matches = useSharedMediaQuery('(min-width: 1181px)')
  return <span>{label}:{matches ? 'wide' : 'narrow'}</span>
}
