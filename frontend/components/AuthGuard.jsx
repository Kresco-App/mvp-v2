'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

export default function AuthGuard({ children }) {
  const router = useRouter()
  const { token, hydrate, isHydrated } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    if (isHydrated && !token) {
      router.replace('/')
    }
  }, [isHydrated, token])

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading Kresco...</span>
        </div>
      </div>
    )
  }

  if (!token) return null

  return children
}
