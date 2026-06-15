'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

import KrescoLogo from '@/components/KrescoLogo'
import { getMyProfile } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'

type CmiReturnStatusProps = {
  outcome: 'ok' | 'fail'
}

type CmiOkStatus = 'loading' | 'active' | 'pending' | 'error'

export default function CmiReturnStatus({ outcome }: CmiReturnStatusProps) {
  const router = useRouter()
  const updateUser = useAuthStore((state) => state.updateUser)
  const [status, setStatus] = useState<CmiOkStatus>(outcome === 'ok' ? 'loading' : 'pending')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    if (outcome !== 'ok') return

    let cancelled = false
    setStatus('loading')

    getMyProfile()
      .then((profile) => {
        if (cancelled) return
        updateUser(profile)
        setStatus(profile.is_pro ? 'active' : 'pending')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [outcome, updateUser, refreshNonce])

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <section className="max-w-sm text-center">
        <KrescoLogo size={48} className="mx-auto mb-6" />

        {status === 'loading' && (
          <>
            <Loader2 size={40} className="animate-spin text-kresco mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Verification CMI...</h1>
            <p className="text-slate-500 mb-6">Nous verifions la confirmation du paiement.</p>
          </>
        )}

        {status === 'active' && (
          <>
            <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Acces Pro active</h1>
            <p className="text-slate-500 mb-6">Votre paiement CMI est confirme. Votre acces est actif.</p>
            <button type="button" onClick={() => router.push('/home')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
              Commencer
            </button>
          </>
        )}

        {status === 'pending' && outcome === 'ok' && (
          <>
            <Loader2 size={40} className="animate-spin text-amber-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Paiement en confirmation</h1>
            <p className="text-slate-500 mb-6">CMI a renvoye la page de retour. L&apos;acces s&apos;active apres la confirmation serveur signee.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => router.push('/home')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
                Retour accueil
              </button>
              <button type="button" onClick={() => setRefreshNonce((value) => value + 1)} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition">
                Actualiser
              </button>
            </div>
          </>
        )}

        {outcome === 'fail' && (
          <>
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Paiement non confirme</h1>
            <p className="text-slate-500 mb-6">Le paiement CMI n&apos;a pas ete confirme. Vous pouvez reessayer ou choisir un autre moyen de paiement.</p>
            <button type="button" onClick={() => router.push('/pricing')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
              Retour aux tarifs
            </button>
          </>
        )}

        {status === 'error' && outcome === 'ok' && (
          <>
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Verification impossible</h1>
            <p className="text-slate-500 mb-6">Nous n&apos;avons pas pu rafraichir votre profil. Reessayez depuis votre espace.</p>
            <button type="button" onClick={() => router.push('/home')} className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
              Retour accueil
            </button>
          </>
        )}
      </section>
    </main>
  )
}
