import type { Metadata } from 'next'
import ApiDataProvider from '@/components/ApiDataProvider'

export const metadata: Metadata = {
  title: 'Révision Studio - Kresco Admin',
  description: 'Révision et application des demandes de modification de cours.',
}

export default function StudioReviewRouteLayout({ children }: { children: React.ReactNode }) {
  return <ApiDataProvider>{children}</ApiDataProvider>
}
