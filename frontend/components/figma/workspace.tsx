'use client'

import type React from 'react'
import { CourseContentRail, type CourseContentRailProps } from './rail'
import { LearningTabBar } from './tabs'
import { figmaWorkspaceTabs } from './data'
import type { FigmaTabItem } from './types'

export type VideoLearningWorkspaceProps = {
  breadcrumb?: string
  title?: string
  videoId?: string
  srcDoc?: string
  tabs?: FigmaTabItem[]
  rail?: CourseContentRailProps
  onTabSelect?: (tab: FigmaTabItem) => void
  children?: React.ReactNode
}

export function VideoLearningWorkspace({
  breadcrumb = '2eme Bac / Sciences Math A / Mathematics / Limits and Continuity',
  title = 'Mathematics: Continuity at a single point and extension',
  srcDoc,
  videoId = 'dQw4w9WgXcQ',
  tabs = figmaWorkspaceTabs,
  rail,
  onTabSelect,
  children,
}: VideoLearningWorkspaceProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[12px] bg-white pb-[120px] pt-[32px]" data-figma-workspace>
      <WorkspaceHeader breadcrumb={breadcrumb} title={title} />

      <div className="grid grid-cols-[minmax(720px,1057px)_351px] justify-between max-[1100px]:grid-cols-1" data-figma-workspace-grid>
        <main className="min-w-0 overflow-hidden pb-[160px] pt-[48px]">
          <VideoPlayerFrame srcDoc={srcDoc} videoId={videoId} />
          <LearningTabBar tabs={tabs} onSelect={onTabSelect} size="compact" />
          {children ?? <LessonBody />}
        </main>

        <div className="pt-[44px]">
          <CourseContentRail {...(rail ?? {})} size="compact" />
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

export function VideoPlayerFrame({ srcDoc, videoId }: { srcDoc?: string; videoId: string }) {
  return (
    <div className="kresco-enter relative h-[596px] w-[1057px] overflow-hidden rounded-[17.617px] border-[2.239px] border-[#e4e4e7] bg-[#f4f4f5] shadow-none transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(24,24,27,0.08)] max-[1100px]:h-auto max-[1100px]:w-full max-[1100px]:aspect-[1057/596]" data-figma-video-frame>
      <iframe
        title="Kresco lesson video"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
        srcDoc={srcDoc}
        scrolling="no"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

export function LessonBody({ children }: { children?: React.ReactNode }) {
  return (
    <article className="kresco-enter max-w-[1057px] pt-[46px]" style={{ animationDelay: '80ms' }} data-figma-lesson-body>
      {children ?? (
        <p className="m-0 text-[16px] font-bold leading-[1.2] tracking-[0.16px] text-[#52525c]">
          The result is quite intuitive: if a continuous function takes two distinct values on an interval, it necessarily takes all the values
          between those two, in other words: the graph of a continuous function has no vertical jump.
        </p>
      )}
    </article>
  )
}
