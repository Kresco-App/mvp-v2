// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminCourseContentEditorPage from '@/app/admin/courses/content/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => new URLSearchParams('subjectId=42&topicId=7&itemId=501'),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/components/animated/registry', () => ({
  AnimatedContentRenderer: ({ rendererKey }: { rendererKey: string }) => (
    React.createElement('div', { 'data-renderer-key': rendererKey }, 'animated component')
  ),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

const workspaceFixture = {
  id: 7,
  slug: 'radioactive-decay',
  title: 'Radioactive decay',
  subject_title: 'Physics',
  active_item: null,
  sections: [
    {
      id: 99,
      title: 'Lesson section',
      items: [
        {
          id: 501,
          title: 'Decay law',
          description: 'Generated lesson shell',
          item_type: 'video',
          tabs: [
            {
              id: 11,
              label: 'Course',
              tab_type: 'course',
              content: '',
              config_json: {
                schema_version: 1,
                blocks: [
                  { id: 'heading-decay', type: 'heading', level: 2, text: 'Decay law' },
                  { id: 'paragraph-decay', type: 'paragraph', text: 'The number of nuclei follows $N(t)$.' },
                  { id: 'formula-decay', type: 'formula', latex: 'N(t)=N_0e^{-\\lambda t}' },
                  { id: 'visual-decay', type: 'component', key: 'decay_law_graph', display: 'inline' },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  document.body.innerHTML = ''
  mocks.getJson.mockImplementation(async (url: string) => {
    if (url === '/courses/topics/7/workspace?item_id=501') return workspaceFixture
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

describe('AdminCourseContentEditorPage', () => {
  it('loads a Course document into the local editor and live preview', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Course JSON')
      expect(container.textContent).toContain('Live preview')
      expect(container.textContent).toContain('Decay law')
      expect(container.textContent).toContain('animated component')
      expect(container.textContent).toContain('Course document is valid for local preview.')
    })

    expect(mocks.getJson).toHaveBeenCalledWith('/courses/topics/7/workspace?item_id=501')
    expect(container.querySelector('[data-renderer-key="decay_law_graph"]')).not.toBeNull()
  })

  it('rejects lab-only component keys before previewing', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Course JSON')
    })

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Course document JSON"]')
    if (!textarea) throw new Error('Course JSON textarea not found')

    const nextDocument = JSON.parse(textarea.value) as { blocks: Array<Record<string, unknown>> }
    nextDocument.blocks = [
      { id: 'lab-visual', type: 'component', key: 'wave_lab', display: 'panel' },
    ]
    setTextareaValue(textarea, JSON.stringify(nextDocument, null, 2))

    await waitFor(() => {
      expect(container.textContent).toContain('Component block "lab-visual" uses a non-course key: wave_lab')
      expect(container.textContent).toContain('Preview')
    })
  })

  it('inserts rich block templates from the block selector', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Block selector')
      expect(container.textContent).toContain('Course JSON')
    })

    clickByAriaLabel(container, 'Insert Equation set block')

    await waitFor(() => {
      const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Course document JSON"]')
      expect(textarea?.value).toContain('"id": "equation-set"')
      expect(textarea?.value).toContain('"type": "equation_set"')
      expect(textarea?.value).toContain('"title": "Relations utiles"')
      expect(container.textContent).toContain('Relations utiles')
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Equation set block inserted.')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(AdminCourseContentEditorPage))
  })

  return { container, root }
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickByAriaLabel(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`button not found: ${label}`)
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
