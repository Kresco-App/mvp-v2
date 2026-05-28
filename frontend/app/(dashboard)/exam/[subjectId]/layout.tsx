import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Examen',
  description: 'Run a focused timed exam practice session in Kresco.',
}

export default function ExamRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
