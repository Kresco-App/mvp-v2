import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Professor Chat',
  description: 'Message professors and manage course conversations in Kresco.',
}

export default function ProfessorChatRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
