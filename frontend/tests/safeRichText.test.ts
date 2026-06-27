// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import SafeRichText, { renderSanitizedHtml, textFromSanitizedHtml } from '@/components/SafeRichText'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let roots: Array<{ root: Root; container: HTMLDivElement }> = []

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n?/g, '\n')
}

afterEach(() => {
  for (const { root, container } of roots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  roots = []
})

describe('SafeRichText', () => {
  it('renders sanitized rich text without injecting raw HTML', async () => {
    const container = renderComponent(React.createElement(SafeRichText, {
      html: '<h2>Lesson</h2><p>Hello <strong>student</strong><script>alert(1)</script><img src=x onerror=alert(1)></p>',
    }))

    expect(container.textContent).toContain('Lesson')
    expect(container.querySelector('h2')).toBeNull()

    await waitFor(() => {
      expect(container.querySelector('h2')?.textContent).toBe('Lesson')
    })

    expect(container.querySelector('strong')?.textContent).toBe('student')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
  })

  it('keeps only safe link attributes', () => {
    const container = renderComponent(React.createElement(React.Fragment, null, renderSanitizedHtml(
      '<a href="javascript:alert(1)" target="_self">bad</a><a href="//evil.example/phish">evil</a><a href="https://kresco.example" target="_blank">good</a><span style="color:red">clean</span>',
    )))

    const links = container.querySelectorAll('a')
    expect(links[0]?.hasAttribute('href')).toBe(false)
    expect(links[0]?.hasAttribute('target')).toBe(false)
    expect(links[1]?.hasAttribute('href')).toBe(false)
    expect(links[2]?.getAttribute('href')).toBe('https://kresco.example')
    expect(links[2]?.getAttribute('target')).toBe('_blank')
    expect(links[2]?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.querySelector('span')?.hasAttribute('style')).toBe(false)
  })

  it('drops nested executable markup before reconstructing React nodes', async () => {
    const container = renderComponent(React.createElement(SafeRichText, {
      html: '<p>Safe <svg><script>alert(1)</script><a href="/ok">link</a></svg><iframe srcdoc="<script>alert(2)</script>"></iframe></p>',
    }))

    await act(async () => undefined)

    expect(container.textContent).toContain('Safe')
    expect(container.textContent).not.toContain('alert')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.innerHTML).not.toContain('srcdoc')
  })

  it('provides a plain text fallback for the pre-hydration render', () => {
    expect(textFromSanitizedHtml('<p>One <strong>two</strong></p>')).toBe('One two')
  })

  it('keeps repeated rich text sanitization and parsing memoized', () => {
    const componentSource = source('components', 'SafeRichText.tsx')

    expect(componentSource).not.toContain("import { sanitizeHtml } from '@/lib/sanitizeHtml'")
    expect(componentSource).toContain("type SanitizeHtmlModule = typeof import('@/lib/sanitizeHtml')")
    expect(componentSource).toContain('let sanitizeHtmlModulePromise: Promise<SanitizeHtmlModule> | null = null')
    expect(componentSource).toContain("sanitizeHtmlModulePromise ??= import('@/lib/sanitizeHtml')")
    expect(componentSource).toContain('const sanitized = sanitizedState.html === html ? sanitizedState.value : readCachedSanitizedRichTextHtml(html)')
    expect(componentSource).toContain('const fallbackContent = useMemo(() => (')
    expect(componentSource).toContain('sanitized ? textFromSanitizedHtml(sanitized) || fallbackText : fallbackText || textFromRawHtml(html)')
    expect(componentSource).toContain('const rendered = useMemo(() => {')
    expect(componentSource).toContain('return renderSanitizedHtml(sanitized)')
    expect(componentSource).toContain('const SANITIZED_RICH_TEXT_CACHE_MAX = 128')
    expect(componentSource).toContain('function readCachedSanitizedRichTextHtml(html: string)')
    expect(componentSource).toContain('function writeCachedSanitizedRichTextHtml(html: string, sanitized: string)')
    expect(componentSource).toContain('sanitizedRichTextCache.delete(first)')
    expect(componentSource).toContain('function textFromRawHtml(html: string)')
  })
})

function renderComponent(element: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ root, container })

  act(() => {
    root.render(element)
  })

  return container
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
