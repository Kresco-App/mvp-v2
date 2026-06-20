// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ChangeReviewBoard from '@/components/admin/ChangeReviewBoard'

const mocks = vi.hoisted(() => ({
  getAdminChangeRequest: vi.fn(),
  listAdminChangeRequests: vi.fn(),
  reviewAdminChangeRequest: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/studio', () => ({
  getAdminChangeRequest: mocks.getAdminChangeRequest,
  listAdminChangeRequests: mocks.listAdminChangeRequests,
  reviewAdminChangeRequest: mocks.reviewAdminChangeRequest,
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

describe('ChangeReviewBoard', () => {
  it('reviews pending operations and moves selection when the current request leaves the filter', async () => {
    mocks.listAdminChangeRequests
      .mockResolvedValueOnce([requestOne, requestTwo])
      .mockResolvedValueOnce([requestTwo])
    mocks.getAdminChangeRequest.mockImplementation((id: number) => {
      if (id === 1) return Promise.resolve(detailOne)
      return Promise.resolve(detailTwo)
    })
    mocks.reviewAdminChangeRequest.mockResolvedValue(appliedDetailOne)

    const { container } = renderComponent()

    await waitFor(() => {
      expect(container.textContent).toContain('Demande #1')
      expect(container.textContent).toContain('Analyse MPSI')
      expect(container.textContent).toContain('2 ops')
    })

    await clickButton(container, 'Rejeter')
    updateReviewNote(container, 'Needs second pass')
    await clickButton(container, 'Appliquer')

    await waitFor(() => {
      expect(mocks.reviewAdminChangeRequest).toHaveBeenCalledWith(
        1,
        [
          { operation_id: 101, decision: 'reject' },
          { operation_id: 102, decision: 'approve' },
        ],
        'Needs second pass',
      )
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Décisions appliquées.')
      expect(container.textContent).toContain('Demande #2')
    })
  })

  it('renders a retryable list error state', async () => {
    mocks.listAdminChangeRequests
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([])

    const { container } = renderComponent()

    await waitFor(() => {
      expect(container.textContent).toContain('Demandes indisponibles')
      expect(mocks.toastError).toHaveBeenCalledWith('Impossible de charger les demandes.')
    })

    await clickButton(container, 'Réessayer')

    await waitFor(() => {
      expect(container.textContent).toContain('Aucune demande')
      expect(mocks.listAdminChangeRequests).toHaveBeenLastCalledWith('pending')
    })
  })
})

function renderComponent() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoot = { root, container }

  act(() => {
    root.render(React.createElement(ChangeReviewBoard))
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

function updateReviewNote(container: HTMLElement, value: string) {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
  expect(textarea).toBeTruthy()
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

  act(() => {
    if (!textarea) return
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let index = 0; index < 40; index += 1) {
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

const requestOne = {
  id: 1,
  course_offering_id: 11,
  offering_title: 'Analyse MPSI',
  professor_name: 'Nadia Ait',
  professor_email: 'nadia@example.test',
  summary: 'Corriger la leçon de limites.',
  status: 'pending',
  operation_count: 2,
  pending_count: 2,
  created_at: '2026-06-20T09:00:00Z',
  reviewed_at: null,
}

const requestTwo = {
  id: 2,
  course_offering_id: 12,
  offering_title: 'Physique PCSI',
  professor_name: 'Omar Rami',
  professor_email: 'omar@example.test',
  summary: 'Ajouter une capsule de révision.',
  status: 'pending',
  operation_count: 1,
  pending_count: 1,
  created_at: '2026-06-20T09:30:00Z',
  reviewed_at: null,
}

const detailOne = {
  ...requestOne,
  admin_note: '',
  operations: [
    {
      id: 101,
      seq: 1,
      op_type: 'update_fields',
      entity_type: 'lesson',
      target_id: 501,
      client_ref: '',
      parent_ref: '',
      payload_json: { title: 'Limites corrigées' },
      snapshot_json: { title: 'Limites' },
      status: 'pending',
      applied_target_id: null,
      error_detail: '',
    },
    {
      id: 102,
      seq: 2,
      op_type: 'delete',
      entity_type: 'tab',
      target_id: 601,
      client_ref: '',
      parent_ref: '',
      payload_json: {},
      snapshot_json: { label: 'Ancienne note' },
      status: 'pending',
      applied_target_id: null,
      error_detail: '',
    },
  ],
}

const appliedDetailOne = {
  ...detailOne,
  status: 'partially_applied',
  admin_note: 'Needs second pass',
  reviewed_at: '2026-06-20T10:00:00Z',
  operations: [
    { ...detailOne.operations[0], status: 'rejected' },
    { ...detailOne.operations[1], status: 'applied', applied_target_id: 601 },
  ],
}

const detailTwo = {
  ...requestTwo,
  admin_note: '',
  operations: [
    {
      id: 201,
      seq: 1,
      op_type: 'update_content',
      entity_type: 'tab',
      target_id: 701,
      client_ref: '',
      parent_ref: '',
      payload_json: { content: 'Nouvelle capsule' },
      snapshot_json: { content: '' },
      status: 'pending',
      applied_target_id: null,
      error_detail: '',
    },
  ],
}
