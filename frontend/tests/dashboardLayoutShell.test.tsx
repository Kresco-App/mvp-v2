// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pathname: '/home',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}))

import DashboardLayoutShell from '@/components/DashboardLayoutShell'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  mountedRoots = []
  document.body.innerHTML = ''
  setViewportMatch(false)
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
})

describe('DashboardLayoutShell', () => {
  it('keeps the permanent sidebar out of the eager dashboard shell bundle', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/DashboardLayoutShell.tsx'), 'utf8')

    expect(source).toContain("import dynamic from 'next/dynamic'")
    expect(source).toContain("import type { PermanentSidebarProps }")
    expect(source).not.toContain("import { PermanentSidebar,")
    expect(source).toContain("import('@/components/figma/permanent-sidebar')")
  })

  it('reserves the sidebar slot without loading the sidebar on mobile widths', async () => {
    mocks.pathname = '/home'

    const { container } = renderShell()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Dashboard content')
    expect(container.querySelector('aside[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('aside[aria-label="Permanent sidebar"]')).toBeNull()
  })

  it('does not add a sidebar slot for routes without dashboard sidebar chrome', async () => {
    mocks.pathname = '/calendar'

    const { container } = renderShell()

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Dashboard content')
    expect(container.querySelector('aside')).toBeNull()
  })
})

function renderShell() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(
      <DashboardLayoutShell>
        <div>Dashboard content</div>
      </DashboardLayoutShell>,
    )
  })

  return { container, root }
}

function setViewportMatch(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
