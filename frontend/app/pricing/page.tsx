'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle2, Crown, Zap, BookOpen, Award, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import AuthGuard from '@/components/AuthGuard'

const GRATUIT_FEATURES = [
  'Acces aux lecons en apercu',
  'Suivi de progression basique',
  'Discussions communautaires',
  '3 matieres disponibles',
]

const PRO_FEATURES = [
  'Toutes les lecons et chapitres debloques',
  'Suivi complet de progression et serie',
  'Quiz interactifs avec correction',
  'Certificats de completion',
  'Support prioritaire',
  'Nouveau contenu chaque semaine',
]

export default function PricingPage() {
  const { user } = useAuthStore()

  useEffect(() => { document.title = 'Tarifs \u2014 Kresco' }, [])

  async function handleCheckout(plan: 'monthly' | 'yearly') {
    try {
      const res = await api.post('/payments/create-checkout-session', null, {
        params: { plan }
      })
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Erreur lors de la creation du paiement.'
      toast.error(msg)
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950 p-6">
        {/* Back button */}
        <div className="max-w-4xl mx-auto mb-6">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Retour a l&apos;accueil
          </Link>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-5">
              <Crown size={14} />
              Ameliorez votre apprentissage
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Tarification simple et transparente
            </h1>
            <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed">
              Un seul plan. Tout le contenu. Annulez a tout moment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Gratuit */}
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-sm">
              <div className="mb-6">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                  <BookOpen size={20} className="text-slate-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Gratuit</h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">0 MAD</span>
                  <span className="text-slate-400 text-sm">/mois</span>
                </div>
                <p className="text-slate-500 text-sm mt-2">Commencez avec les lecons en apercu.</p>
              </div>

              <ul className="space-y-3 mb-8">
                {GRATUIT_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
                    <CheckCircle2 size={16} className="text-slate-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                disabled
                className="w-full py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold cursor-not-allowed"
              >
                {user?.is_pro ? 'Plan precedent' : 'Plan actuel'}
              </button>
            </div>

            {/* Pro */}
            <div className="bg-slate-950 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative">
                <div className="mb-6">
                  <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-4">
                    <Crown size={20} className="text-indigo-400" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-bold text-white">Pro</h2>
                    <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      Le plus populaire
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">99 MAD</span>
                    <span className="text-slate-500 text-sm">/mois</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">ou 799 MAD/an (economisez 33%)</p>
                  <p className="text-slate-400 text-sm mt-2">Tout ce qu&apos;il faut pour reussir votre Bac.</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {PRO_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                      <CheckCircle2 size={16} className="text-indigo-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {user?.is_pro ? (
                  <div className="w-full py-3 rounded-xl bg-green-500/20 text-green-400 text-sm font-bold text-center">
                    <CheckCircle2 size={16} className="inline mr-2" />
                    Vous etes Pro !
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleCheckout('monthly')}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Zap size={16} />
                      S&apos;abonner — 99 MAD/mois
                    </button>
                    <button
                      onClick={() => handleCheckout('yearly')}
                      className="w-full py-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-sm font-semibold transition-colors"
                    >
                      Annuel — 799 MAD/an
                    </button>
                  </div>
                )}

                <p className="text-slate-400 text-xs text-center mt-4">
                  Paiement securise via Stripe · Annulez quand vous voulez
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 text-center">
            {[
              { icon: Award, value: '500+', label: 'Lecons' },
              { icon: Crown, value: '2 400+', label: 'Membres Pro' },
              { icon: CheckCircle2, value: '98%', label: 'Satisfaction' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-sm">
                <Icon size={20} className="text-indigo-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-slate-400 text-sm">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
