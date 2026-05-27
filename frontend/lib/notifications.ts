import api from './axios'

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

export async function listNotifications() {
  const { data } = await api.get<NotificationList>('/notifications')
  return data
}

export async function markNotificationRead(id: number) {
  const { data } = await api.post<NotificationItem>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  await api.post('/notifications/read-all')
}

export async function deleteNotification(id: number) {
  await api.delete(`/notifications/${id}`)
}

export async function deleteAllNotifications() {
  await api.delete('/notifications')
}
