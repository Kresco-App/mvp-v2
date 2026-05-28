import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Live Sessions - Kresco Professor',
  description: 'Create, schedule, control, and moderate professor live sessions.',
}

export default function ProfessorLiveRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
