// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ScientificCalculator from '@/components/zed/ScientificCalculator'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  document.body.innerHTML = ''
  mountedRoots = []
})

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
  vi.restoreAllMocks()
})

describe('ScientificCalculator keyboard handling', () => {
  it('ignores calculator shortcuts while the user is typing in an editable field', () => {
    const { container } = renderCalculator()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }))
    })

    expect(getCalculatorDisplay(container).textContent).toBe('0')
    textarea.remove()
  })

  it('accepts calculator keyboard input when focus is not in an editable field', () => {
    const { container } = renderCalculator()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }))
    })

    expect(getCalculatorDisplay(container).textContent).toBe('7')
  })

  it('removes an inserted function shell as one token with the Backspace button', () => {
    const { container } = renderCalculator()
    const input = getCalculatorInput(container)

    act(() => {
      getButtonByLabel(container, 'Cosine').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(input.value).toBe('cos()')

    act(() => {
      getButtonByLabel(container, 'Backspace').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(input.value).toBe('')
  })
})

function renderCalculator() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(ScientificCalculator, { onClose: vi.fn() }))
  })

  return { container, root }
}

function getCalculatorDisplay(container: HTMLElement) {
  const display = container.querySelector('[aria-label="Affichage calculatrice"]')
  if (!(display instanceof HTMLElement)) throw new Error('Calculator display not found')
  return display
}

function getCalculatorInput(container: HTMLElement) {
  const input = container.querySelector('[aria-label="Calculator expression"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('Calculator input not found')
  return input
}

function getButtonByLabel(container: HTMLElement, label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`)
  return button
}
