// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VerifyEmailPage from '@/app/auth/verify-email/page'

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  routerReplace: vi.fn(),
  applyFirebaseEmailVerification: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/lib/firebaseAuth', () => ({
  applyFirebaseEmailVerification: mocks.applyFirebaseEmailVerification,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mocks.searchParams = new URLSearchParams()
  mocks.applyFirebaseEmailVerification.mockResolvedValue(undefined)
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

describe('Firebase auth action pages', () => {
  it('defers Firebase Auth SDK imports until action execution', () => {
    const verifySource = source('app', 'auth', 'verify-email', 'page.tsx')
    const resetSource = source('app', 'auth', 'reset-password', 'page.tsx')

    expect(verifySource).not.toContain("from '@/lib/firebaseAuth'")
    expect(resetSource).not.toContain("from '@/lib/firebaseAuth'")
    expect(verifySource).toContain("const { applyFirebaseEmailVerification } = await import('@/lib/firebaseAuth')")
    expect(resetSource).toContain("const { confirmFirebasePasswordReset } = await import('@/lib/firebaseAuth')")
  })

  it('treats missing email verification action code as an invalid link', async () => {
    const { container } = renderPage(React.createElement(VerifyEmailPage))

    await waitFor(() => {
      expect(container.textContent).toContain('Vérification échouée')
      expect(container.textContent).toContain('invalide ou a expir')
    })
    expect(mocks.applyFirebaseEmailVerification).not.toHaveBeenCalled()
    expect(mocks.routerReplace).not.toHaveBeenCalled()
  })

  it('applies Firebase email verification when an action code is present', async () => {
    mocks.searchParams = new URLSearchParams('oobCode=valid-code')
    const { container } = renderPage(React.createElement(VerifyEmailPage))

    await waitFor(() => {
      expect(mocks.applyFirebaseEmailVerification).toHaveBeenCalledWith('valid-code')
      expect(container.textContent).toContain('Email')
    })
  })
})

function renderPage(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(element)
  })

  return { container, root }
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

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n?/g, '\n')
}
