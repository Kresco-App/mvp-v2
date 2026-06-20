import { Loader2 } from 'lucide-react'

export default function ExamLoading() {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-[24px] border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-kresco/10 text-kresco">
          <Loader2 size={26} className="animate-spin" />
        </div>
        <h1 className="m-0 mt-5 text-xl font-black text-white">Preparation de l&apos;examen</h1>
        <p className="m-0 mt-2 text-sm font-semibold leading-relaxed text-slate-400">
          Chargement du quiz, du chrono et des consignes.
        </p>
        <div className="mt-6 grid gap-2" aria-hidden="true">
          <div className="h-2 rounded-full bg-slate-800" />
          <div className="mx-auto h-2 w-4/5 rounded-full bg-slate-800" />
          <div className="mx-auto h-2 w-3/5 rounded-full bg-slate-800" />
        </div>
      </section>
    </div>
  )
}
