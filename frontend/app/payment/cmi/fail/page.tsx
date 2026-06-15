import type { Metadata } from 'next'

import CmiReturnStatus from '@/components/payments/CmiReturnStatus'

export const metadata: Metadata = {
  title: 'Paiement CMI non confirme',
  description: "Retour apres un paiement CMI non confirme.",
}

export default function CmiFailPage() {
  return <CmiReturnStatus outcome="fail" />
}
