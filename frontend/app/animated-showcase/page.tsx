import { notFound } from 'next/navigation'

import AnimatedShowcaseSimpleClient from '@/components/animated/AnimatedShowcaseSimpleClient'

export const metadata = {
  title: 'Animated Showcase | Kresco',
  description: 'Minimal preview for directly ported animation components.',
}

export default function AnimatedShowcasePage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return <AnimatedShowcaseSimpleClient />
}
