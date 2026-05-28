import { SkeletonBlock } from '@/components/figma'

export default function ExamBankLoading() {
  return (
    <div className="figma-container">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <SkeletonBlock className="h-12 w-12 rounded-2xl" />
          <SkeletonBlock className="mt-5 h-10 w-48 rounded-[10px]" />
          <SkeletonBlock className="mt-3 h-4 w-80 max-w-full rounded-[6px]" />
        </div>
        <SkeletonBlock className="h-11 w-full rounded-[14px] lg:w-[380px]" />
      </header>
      <div className="grid gap-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <section className="figma-card overflow-hidden" key={index}>
            <div className="border-b border-[#e4e4e7] p-5">
              <SkeletonBlock className="h-3 w-40 rounded-md" />
              <SkeletonBlock className="mt-3 h-5 w-72 max-w-full rounded-md" />
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, problemIndex) => (
                <article className="rounded-2xl border border-[#e4e4e7] bg-[#fbfcff] p-5" key={problemIndex}>
                  <SkeletonBlock className="h-4 w-[58%] rounded-md" />
                  <SkeletonBlock className="mt-3 h-3 w-full rounded-md" />
                  <SkeletonBlock className="mt-2 h-3 w-[72%] rounded-md" />
                  <SkeletonBlock className="mt-5 h-8 w-28 rounded-xl" />
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
