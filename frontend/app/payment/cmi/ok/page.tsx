import type { Metadata } from 'next'

import CmiReturnStatus from '@/components/payments/CmiReturnStatus'

export const metadata: Metadata = {
  title: 'Confirmation CMI',
  description: 'Verification de la confirmation du paiement CMI.',
}

export default function CmiOkPage() {
  return <CmiReturnStatus outcome="ok" />
}
