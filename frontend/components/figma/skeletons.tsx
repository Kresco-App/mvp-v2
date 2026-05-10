export function SkeletonBlock({ className }: { className: string }) {
  return <span className={`kresco-skeleton block ${className}`} aria-hidden="true" />
}

export function FigmaContinueTopicSkeleton({ index = 0 }: { index?: number }) {
  return (
    <article
      className="kresco-enter kresco-skeleton-card relative flex h-[110px] w-full max-w-[480px] overflow-hidden rounded-[16px] border-[2px] bg-white p-[16px]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="min-w-0 flex-1 pr-[150px]">
        <SkeletonBlock className="h-[17px] w-[46%] rounded-[6px]" />
        <SkeletonBlock className="mt-[8px] h-[12px] w-[68%] rounded-[6px]" />
        <SkeletonBlock className="mt-[6px] h-[12px] w-[52%] rounded-[6px]" />
        <span className="absolute bottom-[18px] left-[16px] block h-[10px] w-[300px] overflow-hidden rounded-[4.286px] bg-[#f4f4f5]">
          <SkeletonBlock className="kresco-skeleton-accent h-full w-[38%] rounded-[4.286px]" />
        </span>
      </div>
      <div className="kresco-skeleton kresco-skeleton-media absolute bottom-0 right-0 h-[96px] w-[132px] rounded-tl-[18px]">
        <span className="absolute bottom-[-10px] right-[18px] h-[72px] w-[72px] rounded-full bg-[#e8ebf2]" />
        <span className="absolute right-[44px] top-[18px] h-[28px] w-[38px] rounded-[8px] bg-[#e0e4ec]" />
      </div>
    </article>
  )
}

export function FigmaSubjectShortcutSkeleton({ index = 0 }: { index?: number }) {
  return (
    <article
      className="kresco-enter kresco-skeleton-card grid h-[194px] w-[176px] place-items-center content-center gap-[22px] rounded-[14px] border-[2px] bg-white px-[14px] pb-[21px] pt-[35px] text-center"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="kresco-skeleton kresco-skeleton-media relative h-[66px] w-[66px] rounded-[18px]">
        <span className="absolute -right-[7px] -top-[6px] h-[32px] w-[32px] rounded-full bg-white/70" />
        <span className="absolute bottom-[12px] left-[19px] h-[30px] w-[30px] rounded-[10px] bg-[#dde2ee]" />
      </div>
      <div className="grid justify-items-center gap-2">
        <SkeletonBlock className="h-[16px] w-24 rounded-[6px]" />
        <SkeletonBlock className="h-[14px] w-[86px] rounded-[6px]" />
      </div>
    </article>
  )
}

export function FigmaCourseCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <article
      className="kresco-enter kresco-skeleton-card h-[327.5px] w-full max-w-[344.33px] overflow-hidden rounded-[16px] border-2 bg-white"
      style={{ animationDelay: `${Math.min(index * 45, 220)}ms` }}
    >
      <div className="relative h-[193.5px] border-2 border-[#eceef2] bg-white p-[12px]">
        <div className="kresco-skeleton kresco-skeleton-media absolute inset-[12px] rounded-[10px]">
          <span className="absolute bottom-[28px] left-[28px] h-[54px] w-[54px] rounded-full bg-[#e8ebf2]" />
          <span className="absolute bottom-[44px] left-[86px] h-[34px] w-[96px] rounded-[12px] bg-[#eef1f6]" />
          <span className="absolute right-[28px] top-[24px] h-[42px] w-[88px] rounded-[14px] bg-[#eef1f6]" />
        </div>
        <span className="relative grid h-[36px] w-[36px] place-items-center rounded-[4px] border-2 border-[#eceef2] bg-white">
          <span className="h-[12px] w-[12px] rounded-full bg-[#e4e7ef]" />
        </span>
      </div>
      <div className="grid gap-[10px] p-[12px]">
        <SkeletonBlock className="h-[16px] w-[64%] rounded-[6px]" />
        <span className="block h-[10px] w-full overflow-hidden rounded-[4.286px] bg-[#f4f4f5]">
          <SkeletonBlock className="kresco-skeleton-accent h-full w-[42%] rounded-[4.286px]" />
        </span>
        <SkeletonBlock className="kresco-skeleton-cta h-[44px] w-full rounded-[12px]" />
      </div>
    </article>
  )
}

type SidebarSkeletonSection = 'chrono' | 'calendar' | 'strike' | 'quests' | 'leaderboard'

export function FigmaSidebarSkeleton({
  sections = 4,
  sectionTypes,
}: {
  sections?: number
  sectionTypes?: SidebarSkeletonSection[]
}) {
  const visibleSections = sectionTypes ?? Array.from({ length: sections }, (_, index) => defaultSidebarSkeletonSections[index] ?? 'quests')

  return (
    <aside className="flex w-[351px] shrink-0 flex-col items-start gap-[14px] pb-[120px] pt-11 max-[1180px]:hidden" aria-label="Loading sidebar">
      {visibleSections.map((section, index) => (
        <section
          className="kresco-enter kresco-skeleton-card w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px]"
          style={{ height: sidebarSkeletonHeight(section), animationDelay: `${index * 50}ms` }}
          key={`${section}-${index}`}
        >
          <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
          <SkeletonBlock className="mt-2 h-[13px] w-44 rounded-[6px]" />
          <div className="mt-7 grid gap-3">
            {section === 'quests' || section === 'leaderboard' ? (
              Array.from({ length: section === 'leaderboard' ? 8 : 3 }).map((_, rowIndex) => (
                <div className="grid grid-cols-[32px_1fr] gap-4" key={rowIndex}>
                  <SkeletonBlock className="h-8 w-8 rounded-full" />
                  <div>
                    <SkeletonBlock className="h-[13px] w-[78%] rounded-[6px]" />
                    <SkeletonBlock className="mt-3 h-[12px] w-full rounded-[4px]" />
                  </div>
                </div>
              ))
            ) : section === 'calendar' ? (
              <CalendarSidebarSkeletonBody />
            ) : section === 'strike' ? (
              <StrikeSidebarSkeletonBody />
            ) : (
              <ChronoSidebarSkeletonBody />
            )}
          </div>
        </section>
      ))}
    </aside>
  )
}

function ChronoSidebarSkeletonBody() {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 5 }).map((_, itemIndex) => (
        <SkeletonBlock className="h-[54px] rounded-lg" key={itemIndex} />
      ))}
    </div>
  )
}

function StrikeSidebarSkeletonBody() {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }).map((_, itemIndex) => (
        <div className="grid justify-items-center gap-2" key={itemIndex}>
          <SkeletonBlock className="h-[13px] w-7 rounded-[6px]" />
          <SkeletonBlock className="h-7 w-7 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function CalendarSidebarSkeletonBody() {
  return (
    <div>
      <div className="flex h-12 items-center gap-2">
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-[10.5px]" />
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }).map((_, itemIndex) => (
            <SkeletonBlock className="h-12 rounded-lg" key={itemIndex} />
          ))}
        </div>
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-[10.5px]" />
      </div>
      <div className="mt-8 grid gap-2">
        {Array.from({ length: 2 }).map((_, eventIndex) => (
          <div className="grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[#f7f8fb] px-3" key={eventIndex}>
            <span className="grid min-w-0 gap-2">
              <SkeletonBlock className="h-[14px] w-[72%] rounded-[6px]" />
              <SkeletonBlock className="h-[12px] w-[44%] rounded-[6px]" />
            </span>
            <SkeletonBlock className="h-[12px] w-16 rounded-[6px]" />
          </div>
        ))}
      </div>
    </div>
  )
}

const defaultSidebarSkeletonSections: SidebarSkeletonSection[] = ['chrono', 'calendar', 'strike', 'quests']

function sidebarSkeletonHeight(section: SidebarSkeletonSection) {
  if (section === 'calendar') return 415
  if (section === 'quests') return 305
  if (section === 'leaderboard') return 663
  return 157
}

export function FigmaCoursesSkeleton() {
  return (
    <div className="figma-courses-container">
      <div className="figma-courses-grid">
        <main className="pt-[44px]">
          <div className="mb-[64px] flex h-[18px] items-center">
            <SkeletonBlock className="h-[18px] w-[238px] rounded-[6px]" />
          </div>
          <div className="mb-[32px] flex flex-wrap items-start gap-[18px]">
            <SkeletonBlock className="h-[44px] w-[280px] max-w-full rounded-[14px]" />
            <SkeletonBlock className="h-[44px] w-[170px] max-w-full rounded-[14px]" />
          </div>
          <div className="mb-[32px]">
            <SkeletonBlock className="h-[34px] w-[196px] rounded-[8px]" />
            <SkeletonBlock className="mt-[8px] h-[18px] w-[292px] rounded-[6px]" />
          </div>
          <div className="figma-course-grid">
            {Array.from({ length: 6 }).map((_, index) => <FigmaCourseCardSkeleton key={index} index={index} />)}
          </div>
        </main>
        <FigmaSidebarSkeleton sectionTypes={['quests', 'leaderboard']} />
      </div>
    </div>
  )
}

export function FigmaSubjectDetailSkeleton() {
  return (
    <div className="figma-container">
      <div className="figma-dashboard-grid">
        <main className="w-full">
          <div className="mb-4 flex items-center gap-2">
            <SkeletonBlock className="h-3 w-28 rounded-[6px]" />
            <SkeletonBlock className="h-3 w-20 rounded-[6px]" />
          </div>
          <section className="kresco-skeleton-card mb-8 rounded-2xl border-2 bg-white p-7">
            <div className="flex items-start gap-5">
              <div className="kresco-skeleton kresco-skeleton-media h-14 w-14 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-8 w-64 max-w-full rounded-[8px]" />
                <SkeletonBlock className="mt-3 h-4 w-[68%] rounded-[6px]" />
                <SkeletonBlock className="mt-2 h-4 w-[52%] rounded-[6px]" />
                <div className="mt-5">
                  <div className="mb-2 flex justify-between">
                    <SkeletonBlock className="h-3 w-36 rounded-[6px]" />
                    <SkeletonBlock className="h-3 w-10 rounded-[6px]" />
                  </div>
                  <span className="block h-2 overflow-hidden rounded-full bg-[#f4f4f5]">
                    <SkeletonBlock className="kresco-skeleton-accent h-full w-[34%] rounded-full" />
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="pb-20">
            <SkeletonBlock className="h-7 w-32 rounded-[8px]" />
            <SkeletonBlock className="mt-3 h-4 w-60 rounded-[6px]" />
            <div className="mt-5 grid grid-cols-[repeat(3,344.33px)] gap-[14px] max-[1140px]:grid-cols-[repeat(2,344.33px)] max-[760px]:grid-cols-[344.33px] max-[420px]:grid-cols-1">
              {Array.from({ length: 6 }).map((_, index) => <FigmaCourseCardSkeleton key={index} index={index} />)}
            </div>
          </section>
        </main>
        <FigmaSidebarSkeleton />
      </div>
    </div>
  )
}

export function FigmaVideoWorkspaceSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[12px] bg-white pb-[120px] pt-[32px]">
      <header className="kresco-enter">
        <SkeletonBlock className="h-[18px] w-[360px] max-w-full rounded-[6px]" />
        <SkeletonBlock className="mt-3 h-8 w-[520px] max-w-full rounded-[8px]" />
      </header>
      <div className="grid grid-cols-[minmax(720px,1057px)_351px] justify-between max-[1100px]:grid-cols-1">
        <main className="min-w-0 overflow-hidden pb-[160px] pt-[48px]">
          <div className="kresco-enter kresco-skeleton-card relative h-[596px] w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] bg-[#f7f8fb] max-[1100px]:h-auto max-[1100px]:w-full max-[1100px]:aspect-[1057/596]">
            <div className="kresco-skeleton kresco-skeleton-media absolute inset-0" />
            <span className="absolute left-1/2 top-1/2 grid h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow-[0_10px_30px_rgba(24,24,27,.08)]">
              <span className="ml-1 h-0 w-0 border-y-[11px] border-l-[17px] border-y-transparent border-l-[#d8dce7]" />
            </span>
          </div>
          <div className="flex h-[57px] items-center gap-[8px] border-b-2 border-[#e4e4e7]">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock className="h-[24px] w-[92px] rounded-[8px]" key={index} />
            ))}
          </div>
          <article className="max-w-[1057px] pt-[46px]">
            <SkeletonBlock className="h-4 w-[82%] rounded-[6px]" />
            <SkeletonBlock className="mt-3 h-4 w-[66%] rounded-[6px]" />
            <SkeletonBlock className="mt-6 h-[44px] w-[142px] rounded-[14px]" />
          </article>
        </main>
        <div className="pt-[44px]">
          <aside className="grid w-[351px] gap-[30px] max-[1100px]:w-full">
            <div>
              <SkeletonBlock className="h-[18px] w-32 rounded-[6px]" />
              <SkeletonBlock className="mt-3 h-[14px] w-full rounded-[6px]" />
              <SkeletonBlock className="mt-3 h-[7px] w-full rounded-[4px]" />
            </div>
            {Array.from({ length: 4 }).map((_, index) => (
              <section className="kresco-skeleton-card rounded-[16px] border-2 bg-white px-[18px] py-[18px]" key={index}>
                <SkeletonBlock className="h-[17px] w-28 rounded-[6px]" />
                <SkeletonBlock className="mt-2 h-[13px] w-[86%] rounded-[6px]" />
              </section>
            ))}
          </aside>
        </div>
      </div>
    </div>
  )
}

export function FigmaDashboardSkeleton() {
  return (
    <div className="figma-home-container">
      <div className="figma-home-grid">
        <main className="w-full pt-[32px]">
          <section className="mb-[58px]">
            <div className="mb-[32px]">
              <SkeletonBlock className="h-7 w-40 rounded-lg" />
              <SkeletonBlock className="mt-3 h-4 w-72 rounded-md" />
            </div>
            <div className="grid max-w-[984px] gap-[24px] min-[960px]:grid-cols-[repeat(2,480px)]">
              {Array.from({ length: 2 }).map((_, index) => <FigmaContinueTopicSkeleton key={index} index={index} />)}
            </div>
          </section>
          <section>
            <SkeletonBlock className="h-6 w-28 rounded-lg" />
            <SkeletonBlock className="mt-3 h-4 w-48 rounded-md" />
            <div className="mt-[22px] grid grid-cols-[repeat(5,176px)] gap-[20px] max-[1180px]:grid-cols-[repeat(auto-fit,176px)]">
              {Array.from({ length: 5 }).map((_, index) => <FigmaSubjectShortcutSkeleton key={index} index={index} />)}
            </div>
          </section>
        </main>
        <FigmaSidebarSkeleton />
      </div>
    </div>
  )
}
