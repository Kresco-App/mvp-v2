'use client'

import Link from 'next/link'
import { Home, RotateCcw } from 'lucide-react'

type RouteErrorStateProps = {
  eyebrow?: string
  title: string
  message: string
  digest?: string
  fullScreen?: boolean
  retryLabel?: string
  homeHref?: string
  homeLabel?: string
  onRetry?: () => void
}

export default function RouteErrorState({
  eyebrow = 'View error',
  title,
  message,
  digest,
  fullScreen = false,
  retryLabel = 'Retry',
  homeHref,
  homeLabel = 'Back to app',
  onRetry,
}: RouteErrorStateProps) {
  const content = (
    <section className="w-full max-w-[520px] rounded-lg border-2 border-[#e4e4e7] bg-white p-6 text-left shadow-sm">
      <p className="m-0 text-[13px] font-black uppercase tracking-[0.12em] text-[#9f9fa9]">{eyebrow}</p>
      <h1 className="m-0 mt-2 text-[24px] font-black leading-tight text-[#3f3f46]">{title}</h1>
      <p className="m-0 mt-3 text-[14px] font-semibold leading-relaxed text-[#71717b]">{message}</p>
      {digest && (
        <p className="m-0 mt-3 break-all rounded-md bg-[#f4f4f5] px-3 py-2 text-[12px] font-bold text-[#52525b]">
          Error reference: {digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-0 bg-[#453dee] px-5 text-[14px] font-black text-white"
          >
            <RotateCcw size={16} />
            {retryLabel}
          </button>
        )}
        {homeHref && (
          <Link
            href={homeHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-[#e4e4e7] bg-white px-5 text-[14px] font-black text-[#3f3f46] no-underline"
          >
            <Home size={16} />
            {homeLabel}
          </Link>
        )}
      </div>
    </section>
  )

  if (!fullScreen) return content

  return (
    <main className="grid min-h-screen place-items-center bg-[#fafafa] px-6 py-10">
      {content}
    </main>
  )
}
