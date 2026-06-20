import { SkeletonBlock } from '@/components/figma'

export default function ExamBankLoading() {
  return (
    <main className="pt-[44px]">
      <header className="mb-[32px]">
        <div>
          <SkeletonBlock className="h-5 w-32 rounded-[8px]" />
          <SkeletonBlock className="mt-3 h-10 w-48 rounded-[10px]" />
          <SkeletonBlock className="mt-3 h-5 w-96 max-w-full rounded-[8px]" />
        </div>
        <div className="mt-[22px] flex flex-wrap gap-[18px]">
          <SkeletonBlock className="h-[44px] w-[280px] rounded-[14px]" />
          <SkeletonBlock className="h-[44px] w-[170px] rounded-[14px]" />
          <SkeletonBlock className="h-[44px] w-[150px] rounded-[14px]" />
        </div>
      </header>

      <div className="grid gap-[54px]">
        {Array.from({ length: 2 }).map((_, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="mb-[32px]">
              <SkeletonBlock className="h-8 w-48 rounded-[10px]" />
              <SkeletonBlock className="mt-2 h-5 w-36 rounded-[8px]" />
            </div>
            <div className="figma-course-grid">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <article className="relative h-[300px] w-full max-w-[344.33px] overflow-hidden rounded-[16px] border-2 border-[#e4e4e7] bg-white p-[18px] shadow-[0_3.75px_0_#d9dadd]" key={cardIndex}>
                  <SkeletonBlock className="h-9 w-32 rounded-[12px]" />
                  <SkeletonBlock className="mt-8 h-6 w-44 rounded-[8px]" />
                  <SkeletonBlock className="mt-3 h-14 w-28 rounded-[12px]" />
                  <SkeletonBlock className="mt-7 h-3 w-full rounded-[5px]" />
                  <SkeletonBlock className="mt-4 h-11 w-full rounded-[12px]" />
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
