'use client'

import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import ZedModeOverlay from '@/components/zed/ZedModeOverlay'

export default function ZedPage() {
  const router = useRouter()

  return (
    <AuthGuard>
      <ZedModeOverlay onClose={() => router.push('/home')} />
    </AuthGuard>
  )
}
