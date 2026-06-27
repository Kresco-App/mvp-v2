// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppToaster from '@/components/AppToaster'
import {
  isAppToasterRequested,
  requestAppToaster,
} from '@/lib/lazyToast'

const mocks = vi.hoisted(() => ({
  toasterRender: vi.fn(),
}))

vi.mock('sonner', async () => {
  const React = await import('react')
  return {
    Toaster: (props: Record<string, unknown>) => {
      mocks.toasterRender(props)
      return React.createElement('div', { 'data-testid': 'app-toaster' })
    },
    toast: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    },
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

async function renderToaster() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  await act(async () => {
    root.render(<AppToaster />)
  })
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      if (attempt === 19) throw error
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      })
    }
  }
}

beforeEach(() => {
  mocks.toasterRender.mockClear()
  document.body.innerHTML = ''
  delete (window as Window & { __krescoAppToasterRequested?: boolean }).__krescoAppToasterRequested
  mountedRoot = null
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

describe('AppToaster', () => {
  it('waits for an explicit lazy-toast request before loading sonner', async () => {
    await renderToaster()

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.querySelector('[data-testid="app-toaster"]')).toBeNull()
    expect(isAppToasterRequested()).toBe(false)

    act(() => {
      requestAppToaster()
    })

    expect(isAppToasterRequested()).toBe(true)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="app-toaster"]')).not.toBeNull()
    })
  })

  it('mounts immediately when a lazy-toast request already happened', async () => {
    requestAppToaster()
    await renderToaster()

    await waitFor(() => {
      expect(document.querySelector('[data-testid="app-toaster"]')).not.toBeNull()
    })
    expect(mocks.toasterRender).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'top-right',
        visibleToasts: 3,
      }),
    )
  })
})
