import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Professor Login',
  description: 'Sign in to the Kresco professor workspace.',
}

export default function ProfessorLoginRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
