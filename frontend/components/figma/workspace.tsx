'use client'

import type React from 'react'
import { LockKeyhole, VideoOff } from 'lucide-react'
import { CourseContentRail, type CourseContentRailProps } from './rail'
import { LearningTabBar } from './tabs'
import { figmaWorkspaceTabs } from './data'
import type { FigmaTabItem } from './types'

export type VideoLearningWorkspaceProps = {
  breadcrumb?: string
  title?: string
  videoId?: string
  srcDoc?: string
  primaryContent?: React.ReactNode
  toolbar?: React.ReactNode
  tabs?: FigmaTabItem[]
  rail?: CourseContentRailProps
  onTabSelect?: (tab: FigmaTabItem) => void
  children?: React.ReactNode
}

export function VideoLearningWorkspace({
  breadcrumb = 'Sciences Math A / Mathematics / Limits and Continuity',
  title = 'Mathematics: Continuity at a single point and extension',
  srcDoc,
  videoId,
  primaryContent,
  toolbar,
  tabs = figmaWorkspaceTabs,
  rail,
  onTabSelect,
  children,
}: VideoLearningWorkspaceProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[8px] bg-white pb-[120px] pt-[16px]" data-figma-workspace>
      <WorkspaceHeader breadcrumb={breadcrumb} title={title} />

      <div className="grid grid-cols-[minmax(0,1fr)_351px] gap-[32px] max-[1100px]:grid-cols-1" data-figma-workspace-grid>
        <main className="min-w-0 overflow-hidden pb-[160px] pt-[24px]">
          {primaryContent ?? <VideoPlayerFrame srcDoc={srcDoc} videoId={videoId} />}
          <LearningTabBar tabs={tabs} onSelect={onTabSelect} size="compact" />
          {children ?? <LessonBody />}
        </main>

        <div className="min-w-0 pt-[24px]">
          <CourseContentRail {...(rail ?? {})} toolbar={toolbar} size="compact" />
        </div>
      </div>
    </div>
  )
}

export function WorkspaceHeader({ breadcrumb, title }: { breadcrumb: string; title: string }) {
  return (
    <header className="kresco-enter m-0 whitespace-nowrap pt-0 font-rounded font-bold tracking-[0.24px]" data-figma-workspace-header>
      <p className="m-0 text-[16px] leading-[1.1] text-[#9f9fa9]">
        {breadcrumb}
      </p>
      <h1 className="m-0 text-[24px] font-bold leading-[1.4] tracking-[0.24px] text-[#3f3f46]">
        {title}
      </h1>
    </header>
  )
}

export function PrimaryContentFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="kresco-enter relative aspect-[1057/596] w-full max-w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] bg-white shadow-none transition-[box-shadow] duration-150 ease-out hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)] motion-reduce:transition-none" data-figma-primary-frame>
      <div className="absolute inset-0 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  )
}

export function VideoPlayerFrame({ srcDoc, videoId }: { srcDoc?: string; videoId?: string }) {
  if (!videoId && !srcDoc) {
    return (
      <VideoFrameState
        eyebrow="Video resource"
        title="Video not ready"
        message="Course content stays available below while this lesson video is being prepared."
      />
    )
  }

  const iframeSrc = videoId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`
    : 'about:blank'

  return (
    <div className="kresco-enter relative aspect-[1057/596] w-full max-w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] bg-[#f4f4f5] shadow-none transition-[box-shadow] duration-150 ease-out hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)] motion-reduce:transition-none" data-figma-video-frame>
      <iframe
        title="Kresco lesson video"
        src={iframeSrc}
        srcDoc={srcDoc}
        scrolling="no"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        sandbox="allow-scripts allow-popups allow-presentation"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

export function VideoFrameState({
  eyebrow,
  title,
  message,
  variant = 'missing',
}: {
  eyebrow: string
  title: string
  message: string
  variant?: 'missing' | 'locked'
}) {
  const Icon = variant === 'locked' ? LockKeyhole : VideoOff
  const tone = variant === 'locked'
    ? {
        surface: 'bg-[#fff7ed]',
        icon: 'bg-white text-[#f5900b]',
        eyebrow: 'text-[#c76a00]',
      }
    : {
        surface: 'bg-[#f8f9fc]',
        icon: 'bg-white text-[#5b60f9]',
        eyebrow: 'text-[#5b60f9]',
      }

  return (
    <div className={`kresco-enter relative aspect-[1057/596] w-full max-w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] ${tone.surface} shadow-none`} data-figma-video-frame>
      <section role="status" aria-live="polite" className="absolute inset-0 grid place-items-center px-6 text-center">
        <div className="grid max-w-[430px] justify-items-center">
          <span className={`grid h-14 w-14 place-items-center rounded-[18px] shadow-[0_12px_30px_rgba(24,24,27,0.08)] ${tone.icon}`}>
            <Icon size={25} aria-hidden="true" />
          </span>
          <p className={`m-0 mt-5 text-[12px] font-black uppercase tracking-[0.12em] ${tone.eyebrow}`}>{eyebrow}</p>
          <h2 className="m-0 mt-2 text-[24px] font-black leading-[1.15] tracking-[0.12px] text-[#3f3f46]">{title}</h2>
          <p className="m-0 mt-3 text-[14px] font-bold leading-[1.55] tracking-[0.14px] text-[#71717b]">{message}</p>
        </div>
      </section>
    </div>
  )
}

export function LessonBody({ children }: { children?: React.ReactNode }) {
  return (
    <article className="kresco-enter max-w-[1057px] pt-[46px] [animation-delay:80ms]" data-figma-lesson-body>
      {children ?? (
        <p className="m-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#52525c]">
          The result is quite intuitive: if a continuous function takes two distinct values on an interval, it necessarily takes all the values
          between those two, in other words: the graph of a continuous function has no vertical jump.
        </p>
      )}
    </article>
  )
}
