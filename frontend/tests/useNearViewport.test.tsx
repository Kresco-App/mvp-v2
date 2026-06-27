// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNearViewport } from '@/hooks/useNearViewport'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const observerInstances: MockIntersectionObserver[] = []

class MockIntersectionObserver {
  readonly callback: IntersectionObserverCallback
  readonly options?: IntersectionObserverInit
  readonly observedElements = new Set<Element>()
  readonly observe = vi.fn((element: Element) => {
    this.observedElements.add(element)
  })
  readonly unobserve = vi.fn((element: Element) => {
    this.observedElements.delete(element)
  })
  readonly disconnect = vi.fn(() => {
    this.observedElements.clear()
  })
  readonly takeRecords = vi.fn(() => [])
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    observerInstances.push(this)
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback([
      {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
      } as IntersectionObserverEntry,
    ], this as unknown as IntersectionObserver)
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  observerInstances.length = 0
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
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

describe('useNearViewport', () => {
  it('shares observers by root margin while resolving elements independently', () => {
    act(() => {
      root?.render(
        <>
          <ViewportProbe label="alpha" />
          <ViewportProbe label="beta" />
        </>,
      )
    })

    expect(observerInstances).toHaveLength(1)
    const observer = observerInstances[0]!
    expect(observer.options).toEqual({ rootMargin: '480px', threshold: 0 })
    expect(observer.observe).toHaveBeenCalledTimes(2)

    const [alpha, beta] = Array.from(container!.querySelectorAll('[data-testid="probe"]'))
    expect(alpha?.textContent).toBe('alpha:far')
    expect(beta?.textContent).toBe('beta:far')

    act(() => {
      observer.trigger(alpha!, true)
    })

    expect(alpha?.textContent).toBe('alpha:near')
    expect(beta?.textContent).toBe('beta:far')
    expect(observer.unobserve).toHaveBeenCalledWith(alpha)
    expect(observer.disconnect).not.toHaveBeenCalled()

    act(() => {
      observer.trigger(beta!, true)
    })

    expect(beta?.textContent).toBe('beta:near')
    expect(observer.unobserve).toHaveBeenCalledWith(beta)
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})

function ViewportProbe({ label }: { label: string }) {
  const { nearViewport, ref } = useNearViewport<HTMLDivElement>()
  return (
    <div ref={ref} data-testid="probe">
      {label}:{nearViewport ? 'near' : 'far'}
    </div>
  )
}
