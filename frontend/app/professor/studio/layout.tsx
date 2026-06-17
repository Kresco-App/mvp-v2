import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Studio - Kresco Professor',
  description: 'Organisez et modifiez la structure de votre cours dans Kresco.',
}

export default function ProfessorStudioRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
