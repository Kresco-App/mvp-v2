// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ActivityBuilderPage from '@/app/admin/courses/activities/page'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  })
  mocks.writeText.mockResolvedValue(undefined)
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

describe('ActivityBuilderPage', () => {
  it('requires schema-ready fields before generating JSON', async () => {
    const { container } = renderPage()

    await clickButton(container, 'Générer le JSON')

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Champs à compléter'))
    expect(container.textContent).toContain('Champs requis')
    expect(container.textContent).toContain('Aucun JSON généré')
  })

  it('generates and copies a controlled MCQ activity payload', async () => {
    const { container } = renderPage()

    setInputValue(container, 'MCQ question', 'Quelle est la formule de la célérité ?')
    setInputValue(container, 'Option 1', 'v = λ × f')
    setInputValue(container, 'Option 2', 'E = mc²')

    await clickButton(container, 'Générer le JSON')

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Activity JSON prêt.')
      expect(container.textContent).toContain('"activity_type": "multiple_choice"')
    })

    const payload = JSON.parse(container.querySelector('pre')?.textContent ?? '{}')
    expect(payload).toEqual({
      section_type: 'activity',
      activity_type: 'multiple_choice',
      activity_data: {
        question: 'Quelle est la formule de la célérité ?',
        options: [
          { text: 'v = λ × f', is_correct: true },
          { text: 'E = mc²', is_correct: false },
        ],
      },
    })

    await clickButton(container, 'Copier')

    expect(mocks.writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('JSON copié dans le presse-papiers.')
  })

  it('returns to the admin courses page from the icon action', () => {
    const { container } = renderPage()
    const backButton = container.querySelector<HTMLButtonElement>('button[title="Retour aux cours"]')
    expect(backButton).toBeTruthy()

    act(() => {
      backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.routerPush).toHaveBeenCalledWith('/admin/courses')
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(ActivityBuilderPage))
  })

  return { container, root }
}

async function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  )
  expect(button, `button ${text}`).toBeTruthy()
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function setInputValue(container: HTMLElement, label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  expect(input, `input ${label}`).toBeTruthy()
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

  act(() => {
    if (!input) return
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 30; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
  }
  throw lastError
}
