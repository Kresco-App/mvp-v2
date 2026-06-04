'use client'

import { AuthPageView } from '@/components/auth/AuthPageView'
import AuthGuard from '@/components/AuthGuard'
import { useAuthPageController } from '@/lib/authPageController'

function OnboardingExperience() {
  return <AuthPageView {...useAuthPageController()} />
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingExperience />
    </AuthGuard>
  )
}
