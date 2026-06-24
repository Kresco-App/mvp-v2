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
            <h1 className="mb-2 text-balance text-2xl font-bold text-white">Verification CMI...</h1>
            <p className="mb-6 text-pretty text-slate-500">Nous verifions la confirmation du paiement.</p>
          </>
        )}

        {status === 'active' && (
          <>
            <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
            <h1 className="mb-2 text-balance text-2xl font-bold text-white">Acces Pro active</h1>
            <p className="mb-6 text-pretty text-slate-500">Votre paiement CMI est confirme. Votre acces est actif.</p>
            <button type="button" onClick={() => router.push('/home')} className="min-h-10 rounded-xl bg-kresco px-6 py-3 font-bold text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96]">
              Commencer
            </button>
          </>
        )}

        {status === 'pending' && outcome === 'ok' && (
          <>
            <Loader2 size={40} className="animate-spin text-amber-400 mx-auto mb-4" />
            <h1 className="mb-2 text-balance text-2xl font-bold text-white">Paiement en confirmation</h1>
            <p className="mb-6 text-pretty text-slate-500">CMI a renvoye la page de retour. L&apos;acces s&apos;active apres la confirmation serveur signee.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => router.push('/home')} className="min-h-10 rounded-xl bg-kresco px-6 py-3 font-bold text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96]">
                Retour accueil
              </button>
              <button type="button" onClick={() => setRefreshNonce((value) => value + 1)} className="min-h-10 rounded-xl bg-slate-200 px-6 py-3 font-bold text-slate-700 transition-[background-color,transform] duration-200 hover:bg-slate-300 active:scale-[0.96]">
                Actualiser
              </button>
            </div>
          </>
        )}

        {outcome === 'fail' && (
          <>
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h1 className="mb-2 text-balance text-2xl font-bold text-white">Paiement non confirme</h1>
            <p className="mb-6 text-pretty text-slate-500">Le paiement CMI n&apos;a pas ete confirme. Vous pouvez reessayer ou choisir un autre moyen de paiement.</p>
            <button type="button" onClick={() => router.push('/pricing')} className="min-h-10 rounded-xl bg-kresco px-6 py-3 font-bold text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96]">
              Retour aux tarifs
            </button>
          </>
        )}

        {status === 'error' && outcome === 'ok' && (
          <>
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h1 className="mb-2 text-balance text-2xl font-bold text-white">Verification impossible</h1>
            <p className="mb-6 text-pretty text-slate-500">Nous n&apos;avons pas pu rafraichir votre profil. Reessayez depuis votre espace.</p>
            <button type="button" onClick={() => router.push('/home')} className="min-h-10 rounded-xl bg-kresco px-6 py-3 font-bold text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96]">
              Retour accueil
            </button>
          </>
        )}
      </section>
    </main>
  )
}
