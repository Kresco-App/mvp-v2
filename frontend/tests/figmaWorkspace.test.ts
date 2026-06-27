// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { VideoLearningWorkspace, VideoPlayerFrame } from '@/components/figma/workspace'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []

afterEach(() => {
  for (const { root, container } of mountedRoots) {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  mountedRoots = []
})

describe('Figma workspace video placeholders', () => {
  it('keeps the Figma audit page off the broad figma barrel', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'figma-audit', 'page.tsx'), 'utf8')

    expect(source).not.toContain("from '@/components/figma'")
    expect(source).toContain("from '@/components/figma/workspace'")
    expect(source).toContain("from '@/components/figma/permanent-sidebar'")
  })

  it('does not default generic workspaces to a hardcoded demo YouTube video', () => {
    const { container } = renderComponent(React.createElement(VideoLearningWorkspace))
    const iframe = container.querySelector('iframe')

    expect(iframe).toBeNull()
    expect(container.textContent).toContain('Video not ready')
    expect(container.textContent).not.toContain('dQw4w9WgXcQ')
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('uses the caller-provided video id when a real source is configured', () => {
    const { container } = renderComponent(React.createElement(VideoPlayerFrame, { videoId: 'abc123' }))
    const iframe = container.querySelector('iframe')

    expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abc123?rel=0&modestbranding=1')
  })
})

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  act(() => {
    root.render(element)
  })

  return { container, root }
}
