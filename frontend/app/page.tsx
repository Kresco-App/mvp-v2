'use client'

import { AuthPageView } from '@/components/auth/AuthPageView'
import { useAuthPageController } from '@/lib/authPageController'

export default function AuthPage() {
  return <AuthPageView {...useAuthPageController()} />
}
