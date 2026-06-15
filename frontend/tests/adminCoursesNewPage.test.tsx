// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NewCoursePage from '@/app/admin/courses/new/page'

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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

vi.mock('@/lib/apiClient', () => ({
  postJson: mocks.postJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mocks.postJson.mockImplementation(async (url: string) => {
    if (url === '/courses/subjects') return { id: 42 }
    if (url === '/courses/topics') return { id: 7 }
    throw new Error(`Unexpected API request: ${url}`)
  })
})

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.root.unmount()
    })
    mountedRoot.container.remove()
    mountedRoot = null
  }
})

describe('NewCoursePage backend contract', () => {
  it('creates subjects without unsupported track fields', async () => {
    const { container } = renderPage()

    setControlValue(container.querySelector<HTMLInputElement>('#new-course-title'), 'Mathematics')
    setControlValue(container.querySelector<HTMLTextAreaElement>('#new-course-description'), 'Core math course')
    clickButton(container, 'Suivant')

    setControlValue(container.querySelector<HTMLInputElement>('input[aria-label="Titre du sujet 1"]'), 'Continuity')
    clickButton(container, 'Suivant')
    clickButton(container, 'Creer le cours')

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith('/courses/subjects', {
        title: 'Mathematics',
        description: 'Core math course',
      })
      expect(mocks.postJson).toHaveBeenCalledWith('/courses/topics', {
        subject_id: 42,
        title: 'Continuity',
        order: 1,
      })
      expect(mocks.routerPush).toHaveBeenCalledWith('/admin/courses/42')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(NewCoursePage))
  })

  return { container, root }
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!control) throw new Error(`control not found for value: ${value}`)
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  act(() => {
    valueSetter?.call(control, value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
