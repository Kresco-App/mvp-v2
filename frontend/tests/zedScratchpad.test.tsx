// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Scratchpad from '@/components/zed/Scratchpad'

vi.mock('next/image', async () => {
  const react = await import('react')
  return {
    default: (props: React.ComponentProps<'img'>) => react.createElement('img', props),
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const STORAGE_KEY = 'kresco_zed_scratchpad_test'
let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  mountedRoots = []
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
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

describe('Scratchpad storage synchronization', () => {
  it('merges same-key storage updates from another tab without dropping local history', async () => {
    const { container } = renderScratchpad()

    submitExpression(container, '2+2')
    expect(container.textContent).toContain('2+2')
    expect(container.textContent).toContain('= 4')

    const staleEmptyHistory = '[]'
    await act(async () => {
      localStorage.setItem(STORAGE_KEY, staleEmptyHistory)
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        oldValue: JSON.stringify([{ expr: '2+2', result: '4' }]),
        newValue: staleEmptyHistory,
        storageArea: localStorage,
      }))
      await flushPromises()
    })

    expect(container.textContent).toContain('2+2')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual([
      { expr: '2+2', result: '4' },
    ])

    const oldValue = localStorage.getItem(STORAGE_KEY)
    const externalHistory = JSON.stringify([{ expr: '3+3', result: '6' }])
    await act(async () => {
      localStorage.setItem(STORAGE_KEY, externalHistory)
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        oldValue,
        newValue: externalHistory,
        storageArea: localStorage,
      }))
      await flushPromises()
    })

    expect(container.textContent).toContain('2+2')
    expect(container.textContent).toContain('3+3')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual([
      { expr: '2+2', result: '4' },
      { expr: '3+3', result: '6' },
    ])
  })

  it('clears visible history when another tab clears shared storage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ expr: 'sqrt(16)', result: '4' }]))
    const { container } = renderScratchpad()

    expect(container.textContent).toContain('sqrt(16)')

    await act(async () => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', {
        key: null,
        newValue: null,
        storageArea: localStorage,
      }))
      await flushPromises()
    })

    expect(container.textContent).toContain('Aucun calcul')
    expect(container.textContent).not.toContain('sqrt(16)')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

function renderScratchpad() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(Scratchpad, {
      pinnedSnippets: [],
      onRemoveSnippet: vi.fn(),
      storageKey: STORAGE_KEY,
    }))
  })

  return { container, root }
}

function submitExpression(container: HTMLElement, expression: string) {
  const textarea = container.querySelector('textarea')
  const submitButton = Array.from(container.querySelectorAll('button')).find((button) => (
    button.getAttribute('aria-label') === "Calculer l'expression"
  ))

  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Scratchpad textarea not found')
  if (!(submitButton instanceof HTMLButtonElement)) throw new Error('Scratchpad submit button not found')

  act(() => {
    setTextareaValue(textarea, expression)
  })
  act(() => {
    submitButton.click()
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  valueSetter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
