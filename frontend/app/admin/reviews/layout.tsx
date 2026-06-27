import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reviews - Kresco Admin',
  description: 'Review content changes and video feedback signals.',
}

export default function AdminReviewsLayout({ children }: { children: React.ReactNode }) {
  return children
}
