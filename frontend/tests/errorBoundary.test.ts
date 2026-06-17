// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reportClientError: vi.fn(),
}))

vi.mock('@/lib/clientTelemetry', () => ({
  reportClientError: mocks.reportClientError,
}))

import ErrorBoundary from '@/components/ErrorBoundary'
import RouteErrorState from '@/components/RouteErrorState'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  document.body.innerHTML = ''
  mountedRoots = []
  mocks.reportClientError.mockClear()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  consoleErrorSpy.mockRestore()
})

describe('route error states', () => {
  it('renders a non-blank retryable fallback with reference details', async () => {
    const onRetry = vi.fn()
    const { container } = renderComponent(React.createElement(RouteErrorState, {
      eyebrow: 'Topic unavailable',
      title: 'This topic workspace could not be loaded.',
      message: 'Retry the request or go back home.',
      digest: 'digest-123',
      homeHref: '/home',
      homeLabel: 'Back home',
      onRetry,
    }))

    expect(container.textContent).toContain('Topic unavailable')
    expect(container.textContent).toContain('This topic workspace could not be loaded.')
    expect(container.textContent).toContain('Error reference: digest-123')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/home')

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('can center a segment fallback inside the app shell', () => {
    const { container } = renderComponent(React.createElement(RouteErrorState, {
      eyebrow: 'Topic unavailable',
      title: 'This lesson could not be opened.',
      message: 'Retry the lesson.',
      centered: true,
      homeHref: '/home',
    }))

    const shell = container.querySelector('main')
    expect(shell?.className).toContain('place-items-center')
    expect(shell?.className).toContain('isolate')
    expect(shell?.className).toContain('min-h-[calc(100dvh-84px)]')
    expect(container.textContent).toContain('This lesson could not be opened.')
  })

  it('keeps widget crashes inside a retryable boundary', async () => {
    let shouldThrow = true

    function MaybeExplodes() {
      if (shouldThrow) throw new Error('widget boom')
      return React.createElement('main', null, 'Recovered widget')
    }

    const { container } = renderComponent(React.createElement(
      ErrorBoundary,
      {
        title: 'Widget failed.',
        message: 'Retry just this widget.',
        homeHref: '/home',
      },
      React.createElement(MaybeExplodes),
    ))

    expect(container.textContent).toContain('Widget failed.')
    expect(container.textContent).toContain('Retry just this widget.')
    expect(container.textContent).not.toContain('Recovered widget')
    expect(mocks.reportClientError).toHaveBeenCalledWith(expect.objectContaining({
      source: 'react-error-boundary',
      message: 'widget boom',
    }))

    shouldThrow = false
    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Recovered widget')
    expect(container.textContent).not.toContain('Widget failed.')
  })
})

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(element)
  })

  return { container, root }
}
