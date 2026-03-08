import Link from 'next/link'
import KrescoLogo from '@/components/KrescoLogo'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <KrescoLogo size={48} className="mb-6" />
      <h1 className="text-6xl font-bold text-white mb-2">404</h1>
      <p className="text-slate-500 mb-6">Cette page n&apos;existe pas.</p>
      <Link href="/home" className="px-6 py-3 bg-kresco text-white rounded-xl font-bold hover:opacity-90 transition">
        Retour a l&apos;accueil
      </Link>
    </div>
  )
}
