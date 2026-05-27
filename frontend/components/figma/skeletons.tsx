export function SkeletonBlock({ className }: { className: string }) {
  return <span className={`kresco-skeleton block ${className}`} aria-hidden="true" />
}

export function FigmaContinueTopicSkeleton() {
  return (
    <article
      className="kresco-skeleton-card relative flex h-[110px] w-full max-w-[480px] overflow-hidden rounded-[16px] border-[2px] bg-white p-[16px]"
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

export function FigmaSubjectShortcutSkeleton() {
  return (
    <article
      className="kresco-skeleton-card grid h-[194px] w-[176px] place-items-center content-center gap-[22px] rounded-[14px] border-[2px] bg-white px-[14px] pb-[21px] pt-[35px] text-center"
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

export function FigmaCourseCardSkeleton() {
  return (
    <article
      className="kresco-skeleton-card h-[327.5px] w-full max-w-[344.33px] overflow-hidden rounded-[16px] border-2 bg-white"
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
          className={`kresco-skeleton-card w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px] ${sidebarSkeletonHeightClass(section)}`}
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

function sidebarSkeletonHeightClass(section: SidebarSkeletonSection) {
  if (section === 'calendar') return 'h-[415px]'
  if (section === 'quests') return 'h-[305px]'
  if (section === 'leaderboard') return 'h-[663px]'
  return 'h-[157px]'
}

export function FigmaCoursesSkeleton() {
  return (
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
        {Array.from({ length: 6 }).map((_, index) => <FigmaCourseCardSkeleton key={index} />)}
      </div>
    </main>
  )
}

export function FigmaSubjectDetailSkeleton() {
  return (
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
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[14px]">
          {Array.from({ length: 6 }).map((_, index) => <FigmaCourseCardSkeleton key={index} />)}
        </div>
      </section>
    </main>
  )
}

export function FigmaLiveSkeleton() {
  return (
    <section className="kresco-shell w-full max-w-[860px]">
      <div className="mb-8">
        <SkeletonBlock className="h-4 w-16 rounded-[6px]" />
        <SkeletonBlock className="mt-4 h-11 w-64 max-w-full rounded-[10px]" />
        <SkeletonBlock className="mt-3 h-5 w-[560px] max-w-full rounded-[7px]" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <section className="kresco-skeleton-card h-[132px] rounded-2xl border-2 bg-white p-5" key={index}>
            <SkeletonBlock className="h-4 w-32 rounded-[6px]" />
            <SkeletonBlock className="mt-5 h-6 w-72 max-w-full rounded-[8px]" />
            <SkeletonBlock className="mt-3 h-4 w-44 rounded-[6px]" />
          </section>
        ))}
      </div>
    </section>
  )
}

export function FigmaVideoWorkspaceSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[12px] bg-white pb-[120px] pt-[32px]">
      <header>
        <SkeletonBlock className="h-[18px] w-[360px] max-w-full rounded-[6px]" />
        <SkeletonBlock className="mt-3 h-8 w-[520px] max-w-full rounded-[8px]" />
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_351px] gap-[32px] max-[1100px]:grid-cols-1">
        <main className="min-w-0 overflow-hidden pb-[160px] pt-[48px]">
          <div className="kresco-skeleton-card relative aspect-[1057/596] w-full max-w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] bg-[#f7f8fb]">
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
        <div className="min-w-0 pt-[44px]">
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
    <div className="w-full pt-[32px]">
      <section className="mb-[58px]">
        <div className="mb-[32px]">
          <SkeletonBlock className="h-7 w-40 rounded-lg" />
          <SkeletonBlock className="mt-3 h-4 w-72 rounded-md" />
        </div>
        <div className="grid max-w-[984px] grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-[24px]">
          {Array.from({ length: 2 }).map((_, index) => <FigmaContinueTopicSkeleton key={index} />)}
        </div>
      </section>
      <section>
        <SkeletonBlock className="h-6 w-28 rounded-lg" />
        <SkeletonBlock className="mt-3 h-4 w-48 rounded-md" />
        <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(176px,1fr))] gap-[20px]">
          {Array.from({ length: 5 }).map((_, index) => <FigmaSubjectShortcutSkeleton key={index} />)}
        </div>
      </section>
    </div>
  )
}

export function FigmaProfileSkeleton() {
  return (
    <div className="figma-profile-page">
      <div className="figma-profile-shell">
        <main className="figma-profile-main" aria-label="Loading profile">
          <section className="figma-profile-hero">
            <div className="figma-profile-cover kresco-skeleton kresco-skeleton-media" />
            <div className="figma-profile-avatar kresco-skeleton kresco-skeleton-media" />
            <div className="figma-profile-badges">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock className="h-[32px] w-[30.585px] rounded-full" key={index} />
              ))}
            </div>
            <div className="figma-profile-identity">
              <SkeletonBlock className="h-[27px] w-[190px] rounded-[8px]" />
              <SkeletonBlock className="h-[18px] w-[136px] rounded-[6px]" />
              <SkeletonBlock className="h-[15px] w-[214px] rounded-[6px]" />
            </div>
            <SkeletonBlock className="absolute right-[8px] top-[306px] h-[38px] w-[128px] rounded-[12px]" />
          </section>

          <section className="figma-profile-stats" aria-label="Loading profile stats">
            {Array.from({ length: 6 }).map((_, index) => (
              <article className="figma-profile-stat kresco-skeleton-card" key={index}>
                <SkeletonBlock className="h-[30px] w-[28px] rounded-[9px]" />
                <span className="grid min-w-0 gap-2">
                  <SkeletonBlock className="h-[14px] w-[72%] rounded-[6px]" />
                  <SkeletonBlock className="h-[13px] w-[58%] rounded-[6px]" />
                </span>
              </article>
            ))}
          </section>

          <section className="figma-profile-subjects" aria-label="Loading subject progress">
            <article className="figma-profile-radar-card kresco-skeleton-card">
              <div className="relative h-[259px] w-[320px] max-w-full">
                <span className="kresco-skeleton kresco-skeleton-media absolute left-1/2 top-1/2 h-[178px] w-[178px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock
                    className="absolute h-[13px] w-16 rounded-[6px]"
                    key={index}
                  />
                ))}
              </div>
            </article>
            {Array.from({ length: 6 }).map((_, index) => (
              <article className="figma-profile-score-card kresco-skeleton-card" key={index}>
                <SkeletonBlock className="h-[42px] w-[72px] rounded-[10px]" />
                <SkeletonBlock className="h-[17px] w-[96px] rounded-[6px]" />
                <SkeletonBlock className="h-[12px] w-[112px] rounded-[6px]" />
                <SkeletonBlock className="h-[12px] w-[84px] rounded-[6px]" />
              </article>
            ))}
          </section>

          <section className="grid w-[720px] grid-cols-2 gap-[15px] pt-[31px] max-[760px]:w-full max-[760px]:grid-cols-1" aria-label="Loading profile lists">
            {Array.from({ length: 2 }).map((_, columnIndex) => (
              <article className="kresco-skeleton-card min-h-[276px] rounded-[12px] border-2 bg-white p-[18px]" key={columnIndex}>
                <div className="grid grid-cols-[36px_1fr] items-center gap-3">
                  <SkeletonBlock className="h-9 w-9 rounded-[12px]" />
                  <span>
                    <SkeletonBlock className="h-[16px] w-24 rounded-[6px]" />
                    <SkeletonBlock className="mt-2 h-[13px] w-36 rounded-[6px]" />
                  </span>
                </div>
                <div className="mt-5 grid gap-3">
                  {Array.from({ length: 3 }).map((_, rowIndex) => (
                    <div className="rounded-[12px] border border-[#f1f1f3] bg-[#f7f8fb] p-3" key={rowIndex}>
                      <span>
                        <SkeletonBlock className="h-[15px] w-[80%] rounded-[6px]" />
                        <SkeletonBlock className="mt-2 h-[12px] w-[52%] rounded-[6px]" />
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </main>

        <aside className="figma-profile-rail" aria-label="Loading profile sidebar">
          <section className="kresco-skeleton-card h-[157px] w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px]">
            <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
            <SkeletonBlock className="mt-2 h-[13px] w-44 rounded-[6px]" />
            <div className="mt-7">
              <ChronoSidebarSkeletonBody />
            </div>
          </section>
          <section className="kresco-skeleton-card h-[415px] w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px]">
            <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
            <SkeletonBlock className="mt-2 h-[13px] w-44 rounded-[6px]" />
            <div className="mt-7">
              <CalendarSidebarSkeletonBody />
            </div>
          </section>
          <section className="figma-profile-followers kresco-skeleton-card">
            <div className="figma-profile-follow-tabs">
              <SkeletonBlock className="mx-auto h-[16px] w-24 self-center rounded-[6px]" />
              <SkeletonBlock className="mx-auto h-[16px] w-24 self-center rounded-[6px]" />
              <span />
            </div>
            <div className="figma-profile-follow-list">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="figma-profile-follow-row" key={index}>
                  <SkeletonBlock className="h-10 w-10 rounded-[12.727px]" />
                  <span>
                    <SkeletonBlock className="h-[15px] w-[78%] rounded-[6px]" />
                    <SkeletonBlock className="mt-2 h-[12px] w-[48%] rounded-[6px]" />
                  </span>
                  <SkeletonBlock className="h-4 w-4 rounded-[5px]" />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export function LeaderboardPageSkeleton() {
  return (
    <div className="kresco-shell mx-auto max-w-[980px]">
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <main>
          <section className="card kresco-skeleton-card mb-4 p-5">
            <div className="mb-4 flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-[10px]" />
              <SkeletonBlock className="h-7 w-36 rounded-[8px]" />
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-[14px]">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock className={`${index === 2 ? 'h-[106px] w-[106px]' : 'h-[74px] w-[74px]'} rounded-full`} key={index} />
              ))}
            </div>
            <div className="grid justify-items-center gap-3">
              <SkeletonBlock className="h-[42px] w-[260px] rounded-[10px]" />
              <SkeletonBlock className="h-[20px] w-[300px] rounded-[8px]" />
            </div>
          </section>

          <div className="relative mb-4">
            <SkeletonBlock className="h-[44px] w-full rounded-[12px]" />
          </div>

          <section className="card kresco-skeleton-card overflow-hidden p-0">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                className="grid h-[64px] grid-cols-[32px_36px_1fr_auto] items-center gap-[14px] border-b border-[#e4e4e7] px-5 last:border-b-0"
                key={index}
              >
                <SkeletonBlock className="h-8 w-8 rounded-full" />
                <SkeletonBlock className="h-9 w-9 rounded-full" />
                <span className="grid min-w-0 gap-2">
                  <SkeletonBlock className="h-[15px] w-[46%] rounded-[6px]" />
                  <SkeletonBlock className="h-[12px] w-[32%] rounded-[6px]" />
                </span>
                <SkeletonBlock className="h-[16px] w-24 rounded-[6px]" />
              </div>
            ))}
          </section>
        </main>

        <aside className="grid content-start gap-4">
          <section className="card kresco-skeleton-card p-5">
            <SkeletonBlock className="h-[34px] w-[170px] rounded-[10px]" />
            <SkeletonBlock className="mt-3 h-[14px] w-[190px] rounded-[6px]" />
            <div className="mt-4 flex items-center gap-3">
              <SkeletonBlock className="h-9 w-9 rounded-full" />
              <span className="grid gap-2">
                <SkeletonBlock className="h-[14px] w-28 rounded-[6px]" />
                <SkeletonBlock className="h-[12px] w-20 rounded-[6px]" />
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export function CalendarPageSkeleton() {
  return (
    <div className="figma-container pb-[120px]">
      <div className="figma-dashboard-grid">
        <main className="min-w-0 pt-11">
          <header className="mb-8">
            <SkeletonBlock className="h-[34px] w-[180px] rounded-[8px]" />
            <SkeletonBlock className="mt-2 h-[18px] w-[320px] rounded-[6px]" />
          </header>

          <section className="w-full overflow-hidden bg-white" aria-label="Loading weekly calendar">
            <div className="mb-4 flex items-center justify-between gap-3">
              <SkeletonBlock className="h-[20px] w-[230px] rounded-[6px]" />
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-9 w-9 rounded-[10px]" />
                <SkeletonBlock className="h-9 w-[78px] rounded-[10px]" />
                <SkeletonBlock className="h-9 w-9 rounded-[10px]" />
              </div>
            </div>

            <div className="w-full overflow-hidden">
              <div className="relative w-[1640px]">
                <div className="flex bg-white">
                  <div className="h-11 w-[100px] shrink-0 border-2 border-[#e4e4e7]" />
                  {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="-ml-0.5 flex h-11 w-[220px] shrink-0 items-center justify-center border-2 border-[#e4e4e7] px-3 py-1.5">
                      <SkeletonBlock className="h-[16px] w-[82px] rounded-[6px]" />
                    </div>
                  ))}
                </div>

                <div className="relative flex">
                  <div className="w-[100px] shrink-0">
                    {Array.from({ length: 10 }).map((_, hour) => (
                      <div key={hour} className="-mt-0.5 flex h-20 items-end border-2 border-[#e4e4e7] px-3 pb-1.5">
                        <SkeletonBlock className="h-[14px] w-[46px] rounded-[6px]" />
                      </div>
                    ))}
                  </div>
                  <div className="relative flex">
                    {Array.from({ length: 7 }).map((_, day) => (
                      <div key={day} className="-ml-0.5 w-[220px] shrink-0">
                        {Array.from({ length: 10 }).map((__, hour) => (
                          <div key={hour} className="-mt-0.5 h-20 border-2 border-[#e4e4e7]" />
                        ))}
                      </div>
                    ))}
                    <SkeletonBlock className="absolute left-[222px] top-[160px] h-[118px] w-[216px] rounded-[6px] bg-[#e9ebff]" />
                    <SkeletonBlock className="absolute left-[662px] top-[320px] h-[78px] w-[216px] rounded-[6px] bg-[#e9ebff]" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="flex w-[351px] shrink-0 flex-col gap-[14px] pb-[120px] pt-32 max-[1180px]:mt-8 max-[1180px]:w-full max-[1180px]:pt-0">
          <MiniCalendarSkeleton />
          <EventDetailSkeleton />
        </aside>
      </div>
    </div>
  )
}

function MiniCalendarSkeleton() {
  return (
    <section className="kresco-skeleton-card w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px] max-[1180px]:w-full">
      <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
      <SkeletonBlock className="mt-2 h-[13px] w-44 rounded-[6px]" />
      <div className="mt-6 flex items-start py-2">
        <div className="flex min-w-0 flex-1 items-center px-3">
          <SkeletonBlock className="h-[18px] w-[92px] rounded-[6px]" />
        </div>
        <div className="flex shrink-0 gap-1">
          <SkeletonBlock className="h-8 w-8 rounded-md" />
          <SkeletonBlock className="h-8 w-8 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 49 }).map((_, index) => (
          <SkeletonBlock className={index < 7 ? 'h-[18px] rounded-[6px]' : 'h-[38px] rounded-md'} key={index} />
        ))}
      </div>
    </section>
  )
}

function EventDetailSkeleton() {
  return (
    <section className="kresco-skeleton-card w-[351px] rounded-2xl border-2 bg-white px-[18px] pb-6 pt-[18px] max-[1180px]:w-full">
      <div className="flex items-start justify-between gap-3">
        <span>
          <SkeletonBlock className="h-[16px] w-28 rounded-[6px]" />
          <SkeletonBlock className="mt-2 h-[13px] w-32 rounded-[6px]" />
        </span>
        <SkeletonBlock className="h-8 w-[66px] rounded-md" />
      </div>
      <SkeletonBlock className="mt-6 h-[112px] w-full rounded-lg bg-[#e9ebff]" />
      <div className="mt-5 grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f4f4f5] px-3 py-2" key={index}>
            <SkeletonBlock className="h-[14px] w-16 rounded-[6px]" />
            <SkeletonBlock className="h-[14px] w-32 rounded-[6px]" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="mt-5 h-[48px] w-full rounded-[14px]" />
      <SkeletonBlock className="mt-2 h-[44px] w-full rounded-[14px]" />
    </section>
  )
}
