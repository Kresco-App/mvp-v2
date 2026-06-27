import Link from 'next/link'
import KrescoLogo from '@/components/KrescoLogo'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <KrescoLogo size={48} className="mb-6" />
      <h1 className="text-6xl font-bold text-white mb-2">404</h1>
      <p className="text-slate-500 mb-6">Cette page n&apos;existe pas.</p>
      <Link href="/home" className="min-h-10 rounded-xl bg-kresco px-6 py-3 font-bold text-white transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.96]">
        Retour a l&apos;accueil
      </Link>
    </div>
  )
}
