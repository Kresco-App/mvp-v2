'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, LockKeyhole, Mail } from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import api from '@/lib/axios'
import { AUTH_ROUTES, isProfessorUser } from '@/lib/authPolicy'
import { useAuthStore } from '@/lib/store'

type LoginResponse = {
  user: {
    id: number
    email: string
    full_name: string
    role: string
    tier?: string
  }
}

export default function ProfessorLoginPage() {
  const router = useRouter()
  const { login, logout, hydrate, token, user, isHydrated } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Professor Login - Kresco'
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (isHydrated && token && isProfessorUser(user)) {
      router.replace(AUTH_ROUTES.professorHome)
    }
  }, [isHydrated, router, token, user])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
      if (!isProfessorUser(data.user)) {
        logout()
        setError('This login is only for professor accounts.')
        return
      }
      login(data.user)
      router.replace(AUTH_ROUTES.professorHome)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#fbfbfc] px-4 py-10">
      <section className="w-full max-w-[440px] rounded-[16px] border-[2px] border-[#e4e4e7] bg-white p-6">
        <div className="mb-8 flex items-center justify-between gap-4">
          <KrescoWordmark />
          <span className="rounded-[12px] bg-[#f0f0ff] px-3 py-2 text-[12px] font-black text-[#453dee]">Professor</span>
        </div>
        <div className="mb-7">
          <h1 className="m-0 text-[24px] font-black leading-[1.12] text-[#3f3f46]">Professor Login</h1>
        </div>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-[13px] font-black text-[#52525c]">
            Email
            <span className="flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4">
              <Mail size={17} className="text-[#71717b]" />
              <input
                aria-label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                placeholder="professor@kresco.ma"
              />
            </span>
          </label>
          <label className="grid gap-2 text-[13px] font-black text-[#52525c]">
            Password
            <span className="flex h-12 items-center gap-3 rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-4">
              <LockKeyhole size={17} className="text-[#71717b]" />
              <input
                aria-label="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-[#3f3f46] outline-none"
                placeholder="Password"
              />
            </span>
          </label>
          {error && (
            <p className="m-0 flex items-center gap-2 rounded-[12px] bg-red-50 px-3 py-2 text-[13px] font-bold text-red-600">
              <AlertCircle size={15} />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 rounded-[14px] border-0 bg-[#453dee] px-5 text-[15px] font-black text-white transition hover:bg-[#3a2fd3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function errorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { detail?: unknown } } }
  if (typeof maybe?.response?.data?.detail === 'string') return maybe.response.data.detail
  if (error instanceof Error && error.message) return error.message
  return fallback
}
