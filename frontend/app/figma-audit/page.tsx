'use client'

import {
  ChapterRail,
  CourseContentRail,
  CourseProgressHeader,
  FigmaNavbar,
  FigmaProgressBar,
  FigmaSegmentedChoice,
  LearningTabBar,
  PermanentSidebar,
  RailCard,
  VideoLearningWorkspace,
  VideoPlayerFrame,
  figmaLessonItems,
  figmaWorkspaceTabs,
} from '@/components/figma'
import { QuizPrimitiveShowcase } from '@/components/quiz/QuizPrimitiveShowcase'
import type { ReactNode } from 'react'

const youtubeVideoId = 'M7lc1UVf-VE'

const youtubeSrcDoc = `
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#111;font-family:Arial,sans-serif}
    a{position:absolute;inset:0;display:grid;place-items:center;text-decoration:none;overflow:hidden}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9}
    .veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.38),rgba(0,0,0,.05))}
    .play{position:relative;width:96px;height:68px;border-radius:18px;background:#ff0000;display:grid;place-items:center}
    .play:before{content:"";width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:25px solid white;margin-left:6px}
  </style>
  <a href="https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1">
    <img src="https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg" alt="YouTube video thumbnail">
    <span class="veil"></span>
    <span class="play" aria-label="Play"></span>
  </a>
`

export default function FigmaAuditPage() {
  return (
    <main className="min-h-screen bg-white font-rounded text-[#3f3f46]">
      <div className="audit-catalog">
        <AuditIntro />

        <AuditSection title="Navbar Variants" note="Figma node 554:3868. Width, 64px height, 1440px inner rail, active underline offsets, and action sizes match the component set.">
          <div className="grid gap-5 overflow-x-auto pb-2">
            <FigmaNavbar active="home" />
            <FigmaNavbar active="courses" />
            <FigmaNavbar active="calendar" />
            <FigmaNavbar active="leaderboard" />
            <FigmaNavbar active="live" />
          </div>
        </AuditSection>

        <AuditSection
          title="Video Workspace Composition"
          note="Exact workspace dimensions: 2048px canvas, 1496px video column, 492px right rail, 44px gap."
        >
          <VideoLearningWorkspace srcDoc={youtubeSrcDoc} videoId={youtubeVideoId} />
        </AuditSection>

        <AuditSection title="Workspace Tabs" note="Flat underline tabs from the Figma video workspace. No pill variant here.">
          <div className="max-w-[1496px]">
            <LearningTabBar tabs={figmaWorkspaceTabs} size="workspace" />
          </div>
        </AuditSection>

        <AuditSection
          title="Data-Driven Quiz Primitives"
          note="Prototype catalog for schema-driven quiz surfaces below the player: image choices, approximate numeric answers, slider estimation, formula builder, error spotting, drag/drop, matching, ordering, multi-select, fill blank, region hotspot, short answer, and true/false."
        >
          <QuizPrimitiveShowcase />
        </AuditSection>

        <AuditSection title="Segmented Choice" note="Figma node 573:5952. Keep this as a compact two-option control only, not a workspace tab treatment.">
          <div className="grid w-fit gap-5">
            <FigmaSegmentedChoice value="sun" />
            <FigmaSegmentedChoice value="laser" />
          </div>
        </AuditSection>

        <AuditSection title="Video Player Frame" note="Reusable 1496:842 video surface with the Figma border radius and border width.">
          <div className="max-w-[1496px]">
            <VideoPlayerFrame srcDoc={youtubeSrcDoc} videoId={youtubeVideoId} />
          </div>
        </AuditSection>

        <AuditSection title="Course Content Rail" note="Reusable progress header and accordion rail used beside the player.">
          <div className="grid grid-cols-[492px_492px] gap-10 max-[1100px]:grid-cols-1">
            <CourseContentRail size="workspace" />
            <div className="grid content-start gap-8">
              <CourseProgressHeader size="workspace" />
              <RailCard title="Lesson" copy="Learn the basics of the subject." items={figmaLessonItems} open size="workspace" />
            </div>
          </div>
        </AuditSection>

        <AuditSection title="Chapter Rail Variant" note="Same RailCard primitive, chapter-sized variant only.">
          <ChapterRail />
        </AuditSection>

        <AuditSection title="Permanent Sidebar" note="Figma node 2024:13568. Exact 351px rail with Chrono, Calendar, Weekly Strike, Daily Quests, and Leaderboard cards. Used by /home and subject pages.">
          <PermanentSidebar />
        </AuditSection>

        <AuditSection title="Progress Bars" note="The only reusable progress treatments currently accepted from the Figma references.">
          <div className="grid max-w-[492px] gap-8">
            <FigmaProgressBar value={7} tone="purple" />
            <FigmaProgressBar value={25} tone="orange" />
          </div>
        </AuditSection>

        <AuditSection title="Rejected / Not Implemented" note="Explicitly excluded from this catalog.">
          <ul className="m-0 grid gap-2 pl-6 text-[18px] font-bold leading-snug text-[#6f7280]">
            <li>No old pill tab chooser.</li>
            <li>No flattened screen images as implementation components.</li>
            <li>No heavy-shadow dashboard cards in this workspace audit.</li>
            <li>No stale token/inventory/clone pages that are not reusable component surfaces.</li>
          </ul>
        </AuditSection>
      </div>
    </main>
  )
}

function AuditIntro() {
  return (
    <header className="mx-auto max-w-[1900px] px-8 py-8">
      <p className="m-0 text-[12px] font-black uppercase tracking-[.1em] text-[#3a2fd3]">Figma component audit</p>
      <h1 className="m-0 mt-1 text-[32px] font-bold leading-tight tracking-normal text-[#34343d]">Reusable learning workspace components</h1>
      <p className="m-0 mt-3 max-w-[920px] text-[16px] font-bold leading-snug text-[#71717b]">
        This page shows only component surfaces intended to be reused in the app. Rejected or stale variants are listed explicitly instead of rendered.
      </p>
    </header>
  )
}

function AuditSection({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mx-auto mb-10 max-w-[1900px] border-t border-[#e4e4e7] px-8 py-8">
      <div className="mb-8 flex items-end justify-between gap-6 max-[900px]:block">
        <h2 className="m-0 text-[24px] font-bold leading-tight tracking-normal text-[#34343d]">{title}</h2>
        <p className="m-0 max-w-[760px] text-right text-[14px] font-bold leading-snug text-[#71717b] max-[900px]:mt-2 max-[900px]:text-left">
          {note}
        </p>
      </div>
      {children}
    </section>
  )
}
