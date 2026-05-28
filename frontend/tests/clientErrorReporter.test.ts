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
})

describe('ClientErrorReporter', () => {
  it('reports global window errors and unhandled rejections', () => {
    act(() => {
      root?.render(React.createElement(ClientErrorReporter))
    })

    window.dispatchEvent(new ErrorEvent('error', {
      message: 'window failed',
      error: new Error('window failed'),
    }))
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', {
      configurable: true,
      value: new Error('promise failed'),
    })
    window.dispatchEvent(rejection)

    expect(mocks.reportClientError).toHaveBeenCalledWith(expect.objectContaining({
      source: 'window-error',
      message: 'window failed',
    }))
    expect(mocks.reportUnknownClientError).toHaveBeenCalledWith('unhandled-rejection', expect.any(Error))
  })
})
