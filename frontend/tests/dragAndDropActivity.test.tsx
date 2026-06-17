// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DragAndDrop from '@/components/activities/DragAndDrop'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
  }
  mountedRoot = null
})

function renderActivity(onComplete = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      React.createElement(DragAndDrop, {
        question: 'Match each formula to its name.',
        items: [
          { id: 'ohm', label: 'U = RI' },
          { id: 'force', label: 'F = ma' },
        ],
        zones: [
          { id: 'electricity', label: 'Ohm law', correctItemId: 'ohm' },
          { id: 'mechanics', label: 'Newton law', correctItemId: 'force' },
        ],
        onComplete,
      }),
    )
  })

  mountedRoot = { root, container }
  return { container, onComplete }
}

function buttonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.textContent?.includes(text)
  ))
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

function buttonByLabel(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => (
    candidate.getAttribute('aria-label')?.includes(text)
  ))
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

describe('DragAndDrop activity', () => {
  it('supports a button-based assignment path for keyboard users', () => {
    const { container, onComplete } = renderActivity()

    const ohmButton = buttonByText(container, 'U = RI')
    expect(ohmButton.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      ohmButton.click()
    })
    expect(ohmButton.getAttribute('aria-pressed')).toBe('true')

    act(() => {
      buttonByLabel(container, 'Place selected item in Ohm law').click()
    })
    expect(buttonByLabel(container, 'Ohm law: U = RI')).toBeTruthy()

    act(() => {
      buttonByText(container, 'F = ma').click()
    })
    act(() => {
      buttonByLabel(container, 'Place selected item in Newton law').click()
    })

    act(() => {
      buttonByText(container, 'Verifier').click()
    })

    expect(onComplete).toHaveBeenCalledWith(true)
    expect(container.textContent).toContain('Parfait')
  })
})
