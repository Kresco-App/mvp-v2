'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/axios'
import KrescoLogo from '@/components/KrescoLogo'
import { ArrowLeft, Check } from 'lucide-react'

declare global {
  interface Window {
    google: any
    handleGoogleCredential: (response: any) => void
  }
}

type Step = 'auth' | 'niveau' | 'filiere'

const NIVEAUX = [
  { id: '1bac', label: '1ere Bac' },
  { id: '2bac', label: '2eme Bac' },
]

const SPECIALITES = [
  'Bac Sciences Mathematiques A',
  'Bac Sciences Mathematiques B',
  'Bac Sciences Physiques',
  'Bac SVT',
  'Bac Sciences Et Technologies Electriques',
  'Bac Sciences Et Technologies Mecaniques',
  'Bac Sciences Economiques',
  'Bac Techniques De Gestion Et Comptabilite',
  'Bac Sciences Agronomiques',
  'Bac Lettres',
  'Langue Arabe',
  'Sciences De La Chariaa',
  'Arts Appliques',
  'Autre',
]

export default function AuthPage() {
  const router = useRouter()
  const { login, token, hydrate, isHydrated, user, updateUser } = useAuthStore()
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('auth')
  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedSpec, setSelectedSpec] = useState('')

  useEffect(() => { hydrate() }, [hydrate])

  // If already logged in, check if onboarding is needed
  useEffect(() => {
    if (!isHydrated) return
    if (token && user) {
      if (!user.niveau || !user.filiere) {
        // Needs onboarding
        if (!user.niveau) setStep('niveau')
        else setStep('filiere')
      } else {
        router.replace('/home')
      }
    }
  }, [isHydrated, token, user, router])

  // Google Sign-In
  useEffect(() => {
    if (step !== 'auth') return

    window.handleGoogleCredential = async (response: any) => {
      setLoading(true)
      try {
        const { data } = await api.post('/google-login', { credential: response.credential })
        login(data.access_token, data.user)
        toast.success(`Bienvenue, ${data.user.full_name.split(' ')[0]} !`)

        // Check if user needs onboarding
        if (!data.user.niveau) {
          setStep('niveau')
        } else if (!data.user.filiere) {
          setStep('filiere')
        } else {
          router.push('/home')
        }
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || 'Connexion echouee. Reessayez.')
      } finally {
        setLoading(false)
      }
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: window.handleGoogleCredential,
        })
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
          locale: 'fr',
        })
      }
    }
    document.head.appendChild(script)
    return () => { try { document.head.removeChild(script) } catch { } }
  }, [step, login, router])

  async function saveOnboarding() {
    setLoading(true)
    try {
      const { data } = await api.patch('/profile/me', {
        niveau: selectedLevel,
        filiere: selectedSpec,
      })
      updateUser({ niveau: data.niveau, filiere: data.filiere })
      toast.success('Profil mis a jour !')
      router.push('/home')
    } catch (err: any) {
      console.error('Erreur PATCH /profile/me:', err?.response?.data || err?.message || err)
      toast.error('Erreur lors de la sauvegarde.')
    } finally {
      setLoading(false)
    }
  }

  // Progress indicator
  const stepNum = step === 'auth' ? 1 : step === 'niveau' ? 2 : 3

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[380px] flex flex-col items-center">

        {/* Progress bar */}
        <div className="w-full mb-8">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-kresco rounded-full transition-all duration-500"
              style={{ width: `${(stepNum / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Back button */}
        {step !== 'auth' && (
          <button
            onClick={() => {
              if (step === 'filiere') setStep('niveau')
              else {
                // Can't go back from niveau (already logged in)
                setStep('auth')
              }
            }}
            className="self-start flex items-center gap-1.5 text-slate-500 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Retour
          </button>
        )}

        {/* Logo */}
        <KrescoLogo size={56} className="mb-4" />

        {/* ── STEP 1: Google Auth ────────────────── */}
        {step === 'auth' && (
          <>
            <h1 className="text-[22px] font-bold text-white mb-2">Bienvenue sur Kresco</h1>
            <p className="text-sm text-slate-400 mb-8 text-center">
              Connectez-vous pour acceder a vos cours du Bac marocain.
            </p>

            <div ref={googleButtonRef} className="w-full flex justify-center mb-6" />

            {loading && (
              <p className="text-sm text-slate-400 animate-pulse">Connexion en cours...</p>
            )}
          </>
        )}

        {/* ── STEP 2: Niveau ────────────────────── */}
        {step === 'niveau' && (
          <>
            <h1 className="text-[22px] font-bold text-white mb-2">Quel est votre niveau ?</h1>
            <p className="text-sm text-slate-400 mb-8">Cela nous aide a personnaliser votre experience.</p>

            <div className="w-full space-y-3 mb-8">
              {NIVEAUX.map(n => (
                <button
                  key={n.id}
                  onClick={() => setSelectedLevel(n.id)}
                  className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all text-sm font-medium flex items-center justify-between ${selectedLevel === n.id
                      ? 'border-kresco bg-kresco/5 text-kresco'
                      : 'border-slate-700 text-slate-300 hover:border-kresco/40'
                    }`}
                >
                  {n.label}
                  {selectedLevel === n.id && <Check size={16} />}
                </button>
              ))}
            </div>

            <button
              onClick={() => selectedLevel && setStep('filiere')}
              disabled={!selectedLevel}
              className="w-full py-3.5 rounded-xl bg-kresco hover:bg-kresco-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
            >
              Continuer
            </button>
          </>
        )}

        {/* ── STEP 3: Filiere ───────────────────── */}
        {step === 'filiere' && (
          <>
            <h1 className="text-[22px] font-bold text-white mb-2">Quelle est votre filiere ?</h1>
            <p className="text-sm text-slate-400 mb-6">Selectionnez votre specialite du Bac.</p>

            <div className="w-full grid grid-cols-1 gap-2 mb-8 max-h-[360px] overflow-y-auto pr-1">
              {SPECIALITES.map(spec => (
                <button
                  key={spec}
                  onClick={() => setSelectedSpec(spec)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm flex items-center justify-between ${selectedSpec === spec
                      ? 'border-kresco bg-kresco/5 text-kresco font-semibold'
                      : 'border-slate-700 text-slate-300 hover:border-kresco/40'
                    }`}
                >
                  {spec}
                  {selectedSpec === spec && <Check size={14} />}
                </button>
              ))}
            </div>

            <button
              onClick={saveOnboarding}
              disabled={!selectedSpec || loading}
              className="w-full py-3.5 rounded-xl bg-kresco hover:bg-kresco-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
            >
              {loading ? 'Sauvegarde...' : 'Commencer'}
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-xs text-slate-400 text-center px-4">
        En utilisant Kresco, vous acceptez nos{' '}
        <a href="#" className="text-slate-500 underline">Conditions</a> et notre{' '}
        <a href="#" className="text-slate-500 underline">Politique de confidentialite</a>.
      </p>
    </div>
  )
}
