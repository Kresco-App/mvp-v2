'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api from '@/lib/axios'
import { useAuthStore } from '@/lib/store'
import KrescoLogo from '@/components/KrescoLogo'
import AuthGuard from '@/components/AuthGuard'
import { CheckCircle, Loader2 } from 'lucide-react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { updateUser } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId) { setStatus('error'); return }

    api.get(`/payments/verify-session?session_id=${sessionId}`)
      .then(({ data }) => {
        if (data.is_pro) {
          updateUser({ is_pro: true })
          setStatus('success')
        } else {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [searchParams, updateUser])

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
          <p className="text-slate-500 mb-6">Votre abonnement est actif. Profitez de tous les cours.</p>
          <button onClick={() => router.push('/home')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
            Commencer
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-red-500 font-bold mb-4">Une erreur est survenue.</p>
          <button onClick={() => router.push('/pricing')} className="px-6 py-3 bg-slate-200 text-slate-300 rounded-xl font-bold hover:bg-slate-300 transition">
            Retour
          </button>
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
