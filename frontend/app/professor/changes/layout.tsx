import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Change Requests - Kresco Professor',
  description: 'Review and track professor change requests in Kresco.',
}

export default function ProfessorChangesRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
