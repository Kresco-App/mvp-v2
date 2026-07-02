'use client'

import { useCallback, useState } from 'react'
import { Download, ExternalLink, Eye, X } from 'lucide-react'
import { apiDataErrorMessage } from '@/lib/apiData'
import { showToastError } from '@/lib/lazyToast'
import {
  hasTopicWorkspaceResourceUrl,
  isTopicWorkspaceResourceOpenUnavailable,
  resolveTopicWorkspaceResourceUrl,
  type TabContent,
  type TopicItem,
} from '@/lib/topicWorkspaceViewModel'
import { resolvedTabContentId } from '@/components/topic-workspace/TopicWorkspaceCommonPanels'
import { sanitizeNavigationUrl } from '@/lib/urlSafety'

const RESOURCE_FORMAT_LABEL = 'PDF'
const topicResourceControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b60f9]/15 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100'

function downloadTopicWorkspaceFile(url: string, name: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function TopicWorkspaceResourcePanel({
  resource,
  item,
  tab,
}: {
  resource: NonNullable<TabContent['resource']>
  item: TopicItem
  tab: TabContent
}) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [activeAction, setActiveAction] = useState<'open' | 'preview' | 'download' | null>(null)
  const resourceUrlAvailable = hasTopicWorkspaceResourceUrl(resource)
  const tabContentId = resolvedTabContentId(tab)

  const runResourceAction = useCallback(async (action: 'open' | 'preview' | 'download') => {
    if (!resource.url.trim()) return
    setActiveAction(action)
    try {
      const resolvedUrl = await resolveTopicWorkspaceResourceUrl(resource, action, {
        topic_item_id: item.id,
        tab_content_id: tabContentId,
      })
      if (!resolvedUrl) {
        showToastError('This resource does not expose a usable URL.')
        return
      }
      if (action === 'preview') {
        setPreviewUrl(resolvedUrl)
        return
      }
      if (action === 'download') {
        downloadTopicWorkspaceFile(resolvedUrl, resource.title || 'resource')
        return
      }
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      if (isTopicWorkspaceResourceOpenUnavailable(error)) {
        const fallbackUrl = sanitizeNavigationUrl(resource.url)
        if (!fallbackUrl) {
          showToastError('This resource does not expose a usable URL.')
          return
        }
        if (action === 'preview') {
          setPreviewUrl(fallbackUrl)
        } else if (action === 'download') {
          downloadTopicWorkspaceFile(fallbackUrl, resource.title || 'resource')
        } else {
          window.open(fallbackUrl, '_blank', 'noopener,noreferrer')
        }
        return
      }
      showToastError(apiDataErrorMessage(error, 'Could not open this resource.'))
    } finally {
      setActiveAction(null)
    }
  }, [item.id, resource, tabContentId])

  return (
    <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-[#f7f8fb] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-sm font-black text-[#3f3f46]">{resource.title}</p>
          <p aria-label="Resource format" className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#71717b]">{RESOURCE_FORMAT_LABEL}</p>
        </div>
        {resourceUrlAvailable && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runResourceAction('open')}
              disabled={activeAction !== null}
              className={`inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#3a2fd3] px-3 text-[12px] font-black text-white hover:bg-[#2f27b8] disabled:cursor-not-allowed disabled:bg-[#d4d4d8] ${topicResourceControlMotionClass}`}
            >
              <ExternalLink size={13} aria-hidden="true" />
              Open
            </button>
            <button
              type="button"
              onClick={() => void runResourceAction('preview')}
              disabled={activeAction !== null}
              className={`inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:cursor-not-allowed disabled:text-[#a1a1aa] ${topicResourceControlMotionClass}`}
            >
              <Eye size={13} aria-hidden="true" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => void runResourceAction('download')}
              disabled={activeAction !== null}
              className={`inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d4d4d8] bg-white px-3 text-[12px] font-black text-[#52525c] hover:border-[#cfd2dc] hover:bg-[#f8f9fc] disabled:cursor-not-allowed disabled:text-[#a1a1aa] ${topicResourceControlMotionClass}`}
            >
              <Download size={13} aria-hidden="true" />
              Download
            </button>
          </div>
        )}
      </div>
      {previewUrl && (
        <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e4e4e7] bg-white">
          <div className="flex items-center justify-between border-b border-[#f4f4f5] px-3 py-2">
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9f9fa9]">Preview</span>
            <button
              type="button"
              onClick={() => setPreviewUrl('')}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e4e4e7] bg-white text-[#71717b] hover:bg-[#f8f9fc] ${topicResourceControlMotionClass}`}
              aria-label="Close resource preview"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <iframe
            title={`Preview ${resource.title}`}
            src={previewUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox=""
            className="h-[420px] w-full border-0 bg-white"
          />
        </div>
      )}
    </div>
  )
}
