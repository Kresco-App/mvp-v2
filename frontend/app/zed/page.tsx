'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'

const DeferredZedModeOverlay = dynamic(() => import('@/components/zed/ZedModeOverlay'), {
  ssr: false,
  loading: () => <ZedRouteLoading />,
})

export default function ZedPage() {
  const router = useRouter()

  return (
    <AuthGuard>
      <DeferredZedModeOverlay onClose={() => router.push('/home')} />
    </AuthGuard>
  )
}

function ZedRouteLoading() {
  return (
    <main
      role="status"
      aria-label="Loading Zed Mode"
      className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center font-rounded text-slate-600"
    >
      <span className="grid justify-items-center gap-3">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" />
        <span className="text-sm font-bold">Loading Zed Mode</span>
      </span>
    </main>
  )
}
