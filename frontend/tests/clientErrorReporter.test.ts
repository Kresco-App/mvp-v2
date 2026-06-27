// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reportClientError: vi.fn(),
  reportUnknownClientError: vi.fn(),
}))

vi.mock('@/lib/clientTelemetry', () => ({
  reportClientError: mocks.reportClientError,
  reportUnknownClientError: mocks.reportUnknownClientError,
}))

import ClientErrorReporter from '@/components/ClientErrorReporter'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  mocks.reportClientError.mockClear()
  mocks.reportUnknownClientError.mockClear()
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
  vi.restoreAllMocks()
})

describe('ClientErrorReporter', () => {
  it('reports global window errors and unhandled rejections', async () => {
    const rejectionListeners: Array<(event: PromiseRejectionEvent) => void> = []
    const originalAddEventListener = window.addEventListener.bind(window)
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'unhandledrejection' && typeof listener === 'function') {
        rejectionListeners.push(listener as (event: PromiseRejectionEvent) => void)
      }
      originalAddEventListener(type, listener, options)
    })

    act(() => {
      root?.render(React.createElement(ClientErrorReporter))
    })
    expect(rejectionListeners.length).toBeGreaterThan(0)
    const rejectionReporter = rejectionListeners.find((listener) => String(listener).includes('reportUnknownClientError'))
    expect(rejectionReporter).toEqual(expect.any(Function))

    await act(async () => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'window failed',
        error: new Error('window failed'),
      }))
      rejectionReporter?.({
        reason: new Error('promise failed'),
      } as PromiseRejectionEvent)
      await Promise.resolve()
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(mocks.reportClientError).toHaveBeenCalledWith(expect.objectContaining({
        source: 'window-error',
        message: 'window failed',
      }))
      expect(mocks.reportUnknownClientError).toHaveBeenCalledWith('unhandled-rejection', expect.any(Error))
    })
    addEventListenerSpy.mockRestore()
  })
})
