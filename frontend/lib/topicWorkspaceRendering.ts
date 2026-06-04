import { nextImageOptimizerSrc } from '@/lib/nextImageOptimizer'
import { normalizeRendererKey } from '@/lib/topicWorkspaceTabs'
import type { Resource, TabContent, TopicItem, TopicRailSection, TopicSection, TopicWorkspace } from '@/lib/topicWorkspaceTypes'

const YOUTUBE_PROVIDER_MARKERS = ['youtube', 'youtu']

export function formatTopicItemDuration(seconds: number) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

export function resourceVideoId(resource?: Resource | null) {
  const raw = resource?.provider_resource_id || resource?.url || ''
  const match = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/) || raw.match(/^[A-Za-z0-9_-]{6,}$/)
  return match?.[1] || match?.[0] || null
}

export function isVideoResource(resource?: Resource | null) {
  return resource?.resource_type?.toLowerCase() === 'video'
}

export function isYouTubeResource(resource?: Resource | null) {
  const provider = resource?.provider?.trim().toLowerCase() || ''
  if (YOUTUBE_PROVIDER_MARKERS.some((marker) => provider.includes(marker))) return true
  const raw = `${resource?.provider_resource_id || ''} ${resource?.url || ''}`.toLowerCase()
  return raw.includes('youtube.com') || raw.includes('youtu.be') || raw.includes('youtube-nocookie.com')
}

export function primaryVideoResourceForDisplay(tab: TabContent | null | undefined, item: TopicItem) {
  if (tab?.resource && isVideoResource(tab.resource)) return tab.resource
  if (!tab) return isVideoResource(item.primary_resource) ? item.primary_resource : null
  const type = tab.tab_type.toLowerCase()
  const rendererKey = normalizeRendererKey(tab.renderer_key).toLowerCase()
  if (type === 'video' || rendererKey === 'youtube_embed' || rendererKey === 'video' || rendererKey === 'vdocipher') {
    return isVideoResource(item.primary_resource) ? item.primary_resource : null
  }
  return null
}

export function youtubeVideoId(item: TopicItem) {
  return isYouTubeResource(item.primary_resource) ? resourceVideoId(item.primary_resource) : null
}

export function youtubeVideoIdForTab(tab: TabContent | null | undefined, item: TopicItem) {
  const resource = primaryVideoResourceForDisplay(tab, item)
  if (!isYouTubeResource(resource)) return null
  return resourceVideoId(resource)
}

export function shouldUseTopicItemVideoPlayer(tab: TabContent | null | undefined, item: TopicItem) {
  const resource = primaryVideoResourceForDisplay(tab, item)
  if (!resource || !isVideoResource(resource)) return false
  if (!item.primary_resource || resource.id !== item.primary_resource.id) return false
  if (isYouTubeResource(resource)) return false
  return Boolean(resource.provider_resource_id || resource.url)
}

export function youtubeSrcDoc(item: TopicItem, videoId: string) {
  const title = escapeHtml(item.title)
  const thumbnailSrc = nextImageOptimizerSrc('/figma-assets/course-video-frame.png', 1200)
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; overflow: hidden; background: #f4f4f5; font-family: system-ui, sans-serif; }
      a { position: absolute; inset: 0; display: grid; place-items: center; color: white; text-decoration: none; }
      .thumb { position: absolute; inset: 0; background-image: url("${thumbnailSrc}"); background-size: cover; background-position: center; filter: saturate(.88) brightness(1.05); }
      span { position: absolute; width: 66px; height: 49px; border-radius: 14px; background: rgba(0,0,0,.36); display: grid; place-items: center; }
      span:before { content: ""; margin-left: 4px; border-left: 17px solid white; border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
      </style>
      <a href="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" aria-label="Play ${title}">
        <div class="thumb" role="img" aria-label="${title}"></div>
        <span></span>
      </a>
    `
}

export function lockedVideoSrcDoc(item: TopicItem) {
  const title = escapeHtml(item.title || 'Locked lesson')
  const summary = escapeHtml(item.description || 'Unlock this topic to watch the full lesson and use the attached practice tools.')
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; font-family: system-ui, sans-serif; color: #3f3f46; }
      article { width: min(560px, calc(100% - 48px)); border: 2px solid #e4e4e7; border-radius: 18px; background: white; padding: 24px; box-shadow: 0 18px 42px rgba(24,24,27,.08); }
      b { display: block; margin-bottom: 8px; color: #9f9fa9; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
      h2 { margin: 0; font-size: 22px; line-height: 1.2; }
      p { margin: 12px 0 0; color: #71717b; font-size: 14px; font-weight: 650; line-height: 1.55; }
    </style>
    <article aria-label="Locked lesson preview">
      <b>Locked preview</b>
      <h2>${title}</h2>
      <p>${summary}</p>
    </article>
  `
}

export function missingVideoSrcDoc(item: TopicItem) {
  const title = escapeHtml(item.title || 'Lesson video')
  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f5; font-family: system-ui, sans-serif; color: #3f3f46; }
      article { width: min(560px, calc(100% - 48px)); border: 2px dashed #d4d4d8; border-radius: 18px; background: white; padding: 24px; text-align: center; }
      b { display: block; margin-bottom: 8px; color: #9f9fa9; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
      h2 { margin: 0; font-size: 22px; line-height: 1.2; }
      p { margin: 12px 0 0; color: #71717b; font-size: 14px; font-weight: 650; line-height: 1.55; }
    </style>
    <article aria-label="Missing lesson video">
      <b>Video unavailable</b>
      <h2>${title}</h2>
      <p>This lesson does not have a valid video resource attached yet.</p>
    </article>
  `
}

export function sectionCopy(section: TopicSection) {
  const key = `${section.title} ${section.section_type}`.toLowerCase()
  if (key.includes('lecon') || key.includes('lesson')) return 'Notions essentielles.'
  if (key.includes('exercice') || key.includes('exercise')) return 'Application directe.'
  if (key.includes('devoir') || key.includes('homework')) return 'Sujet court.'
  if (key.includes('extrait') || key.includes('exam')) return "Question d'examen."
  return section.items?.[0]?.description || 'A faire.'
}

export function railLabel(section: TopicSection, item: TopicItem, index: number) {
  const base = section.title.replace(/s$/i, '')
  return item.title?.trim() || `${base} ${index + 1}`
}

export function buildRailSections(workspace: TopicWorkspace, activeItemId: number | null, openIds: Set<string | number>): TopicRailSection[] {
  return workspace.sections.map((section) => ({
    id: section.id,
    title: section.title,
    copy: sectionCopy(section),
    open: openIds.has(section.id),
    items: section.items?.map((item, index) => ({
      id: item.id,
      label: railLabel(section, item, index),
      active: item.id === activeItemId,
      completed: item.progress_status === 'completed',
      disabled: item.can_access === false,
      meta: item.can_access === false ? lockedContentReason(item.locked_reason) : undefined,
    })) ?? [],
  }))
}

export function lockedContentReason(reason?: string) {
  if (reason === 'pro_required') return 'Pro required'
  if (reason === 'vip_required') return 'VIP required'
  if (reason === 'subject_access_required') return 'Subject locked'
  if (reason?.startsWith('feature_required:')) return 'Feature locked'
  return 'Locked'
}
