import { deleteJson, getJson, postJson } from './apiClient'

export type NotificationItem = {
  id: number
  type: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export type NotificationList = {
  notifications: NotificationItem[]
  unread_count: number
}

export type NotificationBulkDeleteConfirmation = {
  confirmation_token: string
  expires_in_seconds: number
}

export async function listNotifications() {
  return getJson<NotificationList>('/notifications')
}

export async function markNotificationRead(id: number) {
  return postJson<NotificationItem>(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead() {
  await postJson('/notifications/read-all')
}

export async function deleteNotification(id: number) {
  await deleteJson(`/notifications/${id}`)
}

export async function getNotificationBulkDeleteConfirmation() {
  return getJson<NotificationBulkDeleteConfirmation>('/notifications/delete-all-confirmation')
}

export async function deleteAllNotifications() {
  const { confirmation_token } = await getNotificationBulkDeleteConfirmation()
  await deleteJson('/notifications', { params: { confirmation_token } })
}
