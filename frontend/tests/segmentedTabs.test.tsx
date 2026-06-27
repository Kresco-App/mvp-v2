// @vitest-environment jsdom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import SegmentedTabs from '@/components/SegmentedTabs'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

afterEach(() => {
  if (!mountedRoot) return
  act(() => {
    mountedRoot?.root.unmount()
  })
  mountedRoot.container.remove()
  mountedRoot = null
})

describe('SegmentedTabs', () => {
  it('supports keyboard selection with arrow, Home, and End keys', () => {
    const changes: string[] = []
    renderComponent(<SegmentedTabsHarness changes={changes} />)

    expect(selectedTab()?.textContent).toBe('Pending')

    dispatchKey('Pending', 'ArrowRight')
    expect(selectedTab()?.textContent).toBe('Approved')
    expect(changes.at(-1)).toBe('approved')

    dispatchKey('Approved', 'End')
    expect(selectedTab()?.textContent).toBe('History')
    expect(changes.at(-1)).toBe('history')

    dispatchKey('History', 'Home')
    expect(selectedTab()?.textContent).toBe('Pending')
    expect(changes.at(-1)).toBe('pending')
  })
})

function SegmentedTabsHarness({ changes }: { changes: string[] }) {
  const [value, setValue] = useState('pending')

  return (
    <SegmentedTabs
      label="Payment operations"
      value={value}
      options={[
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'history', label: 'History' },
      ]}
      onChange={(next) => {
        changes.push(next)
        setValue(next)
      }}
    />
  )
}

function renderComponent(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(node)
  })

  return { container, root }
}

function dispatchKey(label: string, key: string) {
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    .find((item) => item.textContent === label)
  if (!tab) throw new Error(`tab not found: ${label}`)

  act(() => {
    tab.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function selectedTab() {
  return document.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
}
