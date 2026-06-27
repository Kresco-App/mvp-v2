// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CourseContentRail } from '@/components/figma/rail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('CourseContentRail', () => {
  it('preloads rail items on keyboard focus before selection', () => {
    const section = {
      id: 'lesson',
      title: 'Lessons',
      copy: 'Core work',
      open: true,
      items: [{ id: 202, label: 'Continuity practice' }],
    }
    const onItemPreload = vi.fn()
    const onItemSelect = vi.fn()
    const { container } = renderRail(
      <CourseContentRail
        sections={[section]}
        onItemPreload={onItemPreload}
        onItemSelect={onItemSelect}
      />,
    )

    const itemButton = buttonByText(container, 'Continuity practice')
    act(() => {
      itemButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    expect(onItemPreload).toHaveBeenCalledWith(section.items[0], section)
    expect(onItemSelect).not.toHaveBeenCalled()

    act(() => {
      itemButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onItemSelect).toHaveBeenCalledWith(section.items[0], section)
  })
})

function renderRail(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(node)
  })

  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}
