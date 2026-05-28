import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Exam Bank',
  description: 'Practice Bac exam problems, solutions, and topic-linked revision material in Kresco.',
}

export default function ExamBankRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
