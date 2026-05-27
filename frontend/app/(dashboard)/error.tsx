'use client'

import { RotateCcw } from 'lucide-react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="w-full rounded-[16px] border-2 border-[#e4e4e7] bg-white p-6">
      <p className="m-0 text-[13px] font-black uppercase tracking-[0.14em] text-[#9f9fa9]">Dashboard error</p>
      <h1 className="m-0 mt-2 text-[24px] font-black leading-tight text-[#3f3f46]">This dashboard view failed to load.</h1>
      <p className="m-0 mt-3 text-[14px] font-semibold leading-relaxed text-[#71717b]">
        {error.digest ? `Error reference: ${error.digest}` : 'Try loading it again.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border-0 bg-[#453dee] px-5 text-[14px] font-black text-white"
      >
        <RotateCcw size={16} />
        Retry
      </button>
    </section>
  )
}
