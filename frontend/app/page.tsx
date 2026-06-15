'use client'

import { AuthPageView } from '@/components/auth/AuthPageView'
import GuestGuard from '@/components/GuestGuard'
import { useAuthPageController } from '@/lib/authPageController'

export default function AuthPage() {
  return (
    <GuestGuard>
      <AuthPageView {...useAuthPageController()} />
    </GuestGuard>
  )
}
