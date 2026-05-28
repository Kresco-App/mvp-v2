import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Professor Chat',
  description: 'Manage student conversations and professor messaging in Kresco.',
}

export default function ProfessorChatRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
