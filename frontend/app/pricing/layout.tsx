import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tarifs',
  description: 'Comparez les offres Kresco gratuites et Pro.',
}

export default function PricingRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
