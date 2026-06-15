import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: {
    delete: mocks.apiDelete,
    get: mocks.apiGet,
  },
}))

import { deleteAllNotifications, getNotificationBulkDeleteConfirmation } from '@/lib/notifications'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notification client helpers', () => {
  it('loads the bulk delete confirmation token', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      data: { confirmation_token: 'signed-token', expires_in_seconds: 60 },
    })

    await expect(getNotificationBulkDeleteConfirmation()).resolves.toEqual({
      confirmation_token: 'signed-token',
      expires_in_seconds: 60,
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/notifications/delete-all-confirmation')
  })

  it('sends the required confirmation token when clearing all notifications', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      data: { confirmation_token: 'bulk-delete-token', expires_in_seconds: 60 },
    })
    mocks.apiDelete.mockResolvedValueOnce({ data: { ok: true } })

    await deleteAllNotifications()

    expect(mocks.apiGet).toHaveBeenCalledWith('/notifications/delete-all-confirmation')
    expect(mocks.apiDelete).toHaveBeenCalledWith('/notifications', {
      params: { confirmation_token: 'bulk-delete-token' },
    })
  })
})
