'use client'

import { useCallback, useState } from 'react'
import { AuthPageView } from '@/components/auth/AuthPageView'
import GuestGuard from '@/components/GuestGuard'
import KrescoLandingExperience from '@/components/landing/KrescoLandingExperience'
import { useAuthPageController } from '@/lib/authPageController'

export default function AuthPage() {
  const controller = useAuthPageController()
  const [authVisible, setAuthVisible] = useState(false)

  const openAuth = useCallback((mode: 'login' | 'signup') => {
    if (mode === 'login') controller.showLogin()
    else controller.showSignup()
    setAuthVisible(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [controller])

  return (
    <GuestGuard>
      {authVisible ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setAuthVisible(false)}
            className="fixed left-4 top-4 z-50 min-h-10 rounded-[12px] border border-[#e4e4e7] bg-white px-3 text-[13px] font-black text-[#52525c] shadow-[0_8px_22px_rgba(24,24,27,0.08)] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[#453dee] hover:text-[#453dee] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Retour au site
          </button>
          <AuthPageView {...controller} />
        </div>
      ) : (
        <KrescoLandingExperience
          onLogin={() => openAuth('login')}
          onSignup={() => openAuth('signup')}
        />
      )}
    </GuestGuard>
  )
}
