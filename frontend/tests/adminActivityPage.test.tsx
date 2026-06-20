// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminActivityPage from '@/app/admin/activity/page'

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  getJson: mocks.getJson,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mountedRoot: { root: Root; container: HTMLDivElement } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mountedRoot = null
  mocks.getJson.mockResolvedValue(activityFixture)
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

describe('AdminActivityPage', () => {
  it('renders recent audit events and filters them', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(container.textContent).toContain('Activity feed')
      expect(container.textContent).toContain('Action mix')
      expect(container.textContent).toContain('Touched models')
      expect(container.textContent).toContain('API paths')
      expect(container.textContent).toContain('Audit coverage')
      expect(container.textContent).toContain('5 changed fields')
      expect(container.textContent).toContain('/api/admin/permissions')
      expect(container.textContent).toContain('Actor #42')
      expect(container.textContent).toContain('permission grant')
      expect(container.textContent).toContain('finance:read')
      expect(container.textContent).toContain('Actor: #42')
      expect(mocks.getJson).toHaveBeenCalledWith('/admin/activity?limit=120')
    })

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search admin activity"]')
    if (!input) throw new Error('Expected activity search input')
    setInputValue(input, 'ContentReport')

    await waitFor(() => {
      expect(container.textContent).toContain('1 event(s) visible')
      expect(container.textContent).toContain('report update')
      expect(container.textContent).toContain('handled in queue')
      expect(container.textContent).not.toContain('finance:read')
    })
  })
})

function renderPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<AdminActivityPage />)
  })
  mountedRoot = { root, container }
  return { container }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const startedAt = Date.now()
  let lastError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }
  throw lastError
}

const activityFixture = {
  generated_at: '2026-06-20T10:00:00Z',
  summary: {
    total_audit_rows: 12,
    created_24h: 3,
    created_7d: 8,
    actors_in_feed: 2,
    models_in_feed: 2,
  },
  by_action: {
    permission_grant: 2,
    report_update: 1,
  },
  by_model: {
    UserPermission: 2,
    ContentReport: 1,
  },
  entries: [
    {
      id: 51,
      action: 'permission_grant',
      model_name: 'UserPermission',
      object_pk: '41',
      object_repr: '42:finance:read',
      summary: '42:finance:read: finance:read',
      actor_user_id: 42,
      request_path: '/api/admin/permissions',
      client_host: '127.0.0.1',
      changed_keys: ['actor_user_id', 'permission', 'reason'],
      changed_data: {
        actor_user_id: 42,
        permission: 'finance:read',
        reason: 'activity fixture',
      },
      created_at: '2026-06-20T09:00:00Z',
    },
    {
      id: 50,
      action: 'report_update',
      model_name: 'ContentReport',
      object_pk: '7',
      object_repr: 'Live report',
      summary: 'Live report: handled in queue',
      actor_user_id: 42,
      request_path: '/api/admin/reports/7',
      client_host: '127.0.0.1',
      changed_keys: ['actor_user_id', 'resolution_note', 'status'],
      changed_data: {
        actor_user_id: 42,
        status: 'resolved',
        resolution_note: 'handled in queue',
      },
      created_at: '2026-06-20T08:00:00Z',
    },
  ],
}
