// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ZedModeOverlay from '@/components/zed/ZedModeOverlay'

const pdfViewerMock = vi.hoisted(() => ({
  props: [] as Array<{
    activeTool: string
    onAnnotationStatsChange?: (stats: { highlights: number; drawings: number; textNotes: number; total: number }) => void
    onDocumentChange?: (document: { id: string; name: string; size: number; pageCount: number } | null) => void
  }>,
}))

vi.mock('@/components/zed/PdfViewerCore', async () => {
  const React = await import('react')
  function MockPdfViewer(props: (typeof pdfViewerMock.props)[number]) {
    pdfViewerMock.props.push(props)

    return React.createElement('div', { 'data-testid': 'pdf-viewer' }, `PDF tool ${props.activeTool}`)
  }

  return {
    default: MockPdfViewer,
  }
})

vi.mock('@/components/zed/ScientificCalculator', async () => {
  const React = await import('react')

  return {
    default: ({ initialMode, onFloat, variant }: { initialMode?: string; onFloat?: (mode: string) => void; variant?: string }) => React.createElement(
      'button',
      {
        'data-testid': `calculator-${variant ?? 'default'}-${initialMode ?? 'scientific'}`,
        type: 'button',
        onClick: () => onFloat?.(initialMode ?? 'scientific'),
      },
      `Calculator ${initialMode ?? 'scientific'}`,
    ),
  }
})

vi.mock('@/components/zed/FormulaLibrary', async () => {
  const React = await import('react')

  return {
    default: () => React.createElement('div', { 'data-testid': 'rappels' }, 'Formula catalog'),
  }
})

vi.mock('framer-motion', async () => {
  const React = await import('react')

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: {
      div: ({
        animate: _animate,
        children,
        exit: _exit,
        initial: _initial,
        transition: _transition,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        animate?: unknown
        exit?: unknown
        initial?: unknown
        transition?: unknown
      }) => {
        void _animate
        void _exit
        void _initial
        void _transition
        return React.createElement('div', props, children)
      },
    },
  }
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  mountedRoots = []
  pdfViewerMock.props = []
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

describe('ZedModeOverlay', () => {
  it('keeps the full Zed workspace out of the eager route module', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/zed/page.tsx'), 'utf8')

    expect(source).toContain("import dynamic from 'next/dynamic'")
    expect(source).not.toContain("import ZedModeOverlay from '@/components/zed/ZedModeOverlay'")
    expect(source).toContain("dynamic(() => import('@/components/zed/ZedModeOverlay')")
    expect(source).toContain('ssr: false')
  })

  it('keeps the overlay off the old split-pane and pin storage path', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/zed/ZedModeOverlay.tsx'), 'utf8')

    expect(source).toContain('activeTool={activeAnnotationTool}')
    expect(source).toContain('<AnnotationToolbar')
    expect(source).not.toContain('kresco:zed:split:v1')
    expect(source).not.toContain('kresco:zed:pins:v1')
  })

  it('passes annotation tool changes to the PDF viewer', () => {
    const { container } = renderOverlay()

    expect(container.textContent).toContain('PDF tool select')

    act(() => {
      getButton(container, 'Highlight').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pdfViewerMock.props.at(-1)?.activeTool).toBe('highlight')
    expect(container.textContent).toContain('PDF tool highlight')
  })

  it('resets the active annotation tool with Escape before leaving the overlay', () => {
    const { container } = renderOverlay()

    act(() => {
      getButton(container, 'Draw').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(pdfViewerMock.props.at(-1)?.activeTool).toBe('draw')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(pdfViewerMock.props.at(-1)?.activeTool).toBe('select')
  })

  it('keeps Zed note writes off the typing path until pagehide flush', async () => {
    vi.useFakeTimers()
    try {
      const { container } = renderOverlay()

      act(() => {
        pdfViewerMock.props.at(-1)?.onDocumentChange?.({
          id: 'doc-1',
          name: 'Limits.pdf',
          size: 128,
          pageCount: 4,
        })
      })
      await act(async () => {
        getButton(container, 'Notes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
        vi.advanceTimersByTime(300)
        await Promise.resolve()
      })

      const textarea = container.querySelector<HTMLTextAreaElement>('textarea#zed-session-notes')
      expect(textarea).not.toBeNull()

      act(() => {
        setTextareaValue(textarea!, 'Review the derivative table.')
        textarea!.dispatchEvent(new Event('input', { bubbles: true }))
      })

      expect(localStorage.getItem('kresco:zed:notes:v1:doc-1')).toBeNull()

      window.dispatchEvent(new Event('pagehide'))

      expect(localStorage.getItem('kresco:zed:notes:v1:doc-1')).toBe('Review the derivative table.')
    } finally {
      vi.useRealTimers()
    }
  })
})

function renderOverlay() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(React.createElement(ZedModeOverlay, { onClose: vi.fn() }))
  })

  return { container, root }
}

function getButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))
  if (!button) throw new Error(`button not found: ${name}`)
  return button
}

function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
}
