'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiJsonClient } from '@/lib/apiClient'
import { getMyProfile } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'
import { verifyCheckoutSession } from '@/lib/payments'
import KrescoLogo from '@/components/KrescoLogo'
import AuthGuard from '@/components/AuthGuard'
import { CheckCircle, Loader2 } from 'lucide-react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const updateUser = useAuthStore((state) => state.updateUser)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    let cancelled = false
    setStatus('loading')

    verifyCheckoutSession(apiJsonClient, sessionId)
      .then(async (result) => {
        if (cancelled) return
        if (result.status !== 'success') {
          setStatus('error')
          return
        }

        try {
          const profile = await getMyProfile()
          if (cancelled) return
          updateUser({ ...profile, ...result.userPatch })
        } catch {
          if (cancelled) return
          updateUser(result.userPatch)
        }

        setStatus('success')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [searchParams, updateUser, retryNonce])

  return (
    <div className="text-center max-w-sm">
      <KrescoLogo size={48} className="mx-auto mb-6" />
      {status === 'loading' && (
        <>
          <Loader2 size={40} className="animate-spin text-kresco mx-auto mb-4" />
          <p className="text-slate-500">Verification du paiement...</p>
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Bienvenue dans Kresco Pro !</h1>
          <p className="text-slate-500 mb-6">Votre acces Pro est actif. Profitez de tous les cours.</p>
          <button type="button" onClick={() => router.push('/home')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
            Commencer
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-red-500 font-bold mb-4">Une erreur est survenue.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => setRetryNonce((value) => value + 1)} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
              Réessayer
            </button>
            <button type="button" onClick={() => router.push('/pricing')} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition">
              Retour
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <Suspense fallback={
          <div className="text-center">
            <Loader2 size={40} className="animate-spin text-kresco mx-auto mb-4" />
            <p className="text-slate-500">Chargement...</p>
          </div>
        }>
          <PaymentSuccessContent />
        </Suspense>
      </div>
    </AuthGuard>
  )
}
