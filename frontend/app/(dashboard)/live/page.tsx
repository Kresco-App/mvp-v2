'use client'

import Link from 'next/link'
import { ArrowRight, Radio } from 'lucide-react'
import { PermanentSidebar, permanentSidebarLiveEventDefaults } from '@/components/figma'

export default function LivePage() {
  return (
    <main className="figma-container">
      <div className="figma-dashboard-grid">
        <section className="kresco-shell w-full max-w-[760px]">
          <div className="mb-8">
            <p className="figma-eyebrow">Live</p>
            <h1 className="font-rounded text-[40px] font-bold leading-tight tracking-normal text-[#3f3f46]">Live sessions</h1>
            <p className="mt-2 max-w-[560px] text-[20px] font-semibold leading-relaxed text-[#71717b]">
              Burner schedule shell for upcoming Bac support sessions.
            </p>
          </div>

          <div className="grid gap-4">
            {permanentSidebarLiveEventDefaults.map((event) => (
              <article className="rounded-2xl border-2 border-[#e4e4e7] bg-white p-5 shadow-none" key={event.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eef1ff] text-[#453dee]">
                      <Radio size={24} strokeWidth={2.6} />
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.12em] text-[#9f9fa9]">{event.subject}</p>
                      <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-normal text-[#3f3f46]">{event.title}</h2>
                      <p className="mt-1 text-[16px] font-semibold text-[#71717b]">{event.startsAt}</p>
                    </div>
                  </div>
                  <Link className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#453dee] px-4 text-sm font-bold text-white no-underline" href="/home">
                    Prepare
                    <ArrowRight size={17} strokeWidth={2.7} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <PermanentSidebar />
      </div>
    </main>
  )
}
