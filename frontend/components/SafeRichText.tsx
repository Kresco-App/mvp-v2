'use client'

import React, { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'

import { isSafeLinkHref } from '@/lib/urlSafety'

const allowedElementTags = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

type SafeRichTextProps = {
  html: string
  fallbackText?: string
}

type SanitizeHtmlModule = typeof import('@/lib/sanitizeHtml')

let sanitizeHtmlModulePromise: Promise<SanitizeHtmlModule> | null = null

export default function SafeRichText({ html, fallbackText = '' }: SafeRichTextProps) {
  const [mounted, setMounted] = useState(false)
  const [sanitizedState, setSanitizedState] = useState(() => ({
    html,
    value: readCachedSanitizedRichTextHtml(html),
  }))
  const sanitized = sanitizedState.html === html ? sanitizedState.value : readCachedSanitizedRichTextHtml(html)
  const fallbackContent = useMemo(() => (
    sanitized ? textFromSanitizedHtml(sanitized) || fallbackText : fallbackText || textFromRawHtml(html)
  ), [fallbackText, html, sanitized])
  const rendered = useMemo(() => {
    if (!mounted || !sanitized || typeof DOMParser === 'undefined') return []
    return renderSanitizedHtml(sanitized)
  }, [mounted, sanitized])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const cached = readCachedSanitizedRichTextHtml(html)
    if (cached !== null) {
      setSanitizedState({ html, value: cached })
      return
    }

    setSanitizedState({ html, value: null })
    let cancelled = false
    void loadSanitizeHtmlModule().then(({ sanitizeHtml }) => {
      if (cancelled) return
      const nextSanitized = writeCachedSanitizedRichTextHtml(html, sanitizeHtml(html))
      setSanitizedState({ html, value: nextSanitized })
    })
    return () => {
      cancelled = true
    }
  }, [html])

  if (!mounted || !sanitized || typeof DOMParser === 'undefined') {
    return <>{fallbackContent}</>
  }

  return <>{rendered.length > 0 ? rendered : fallbackText}</>
}

const SANITIZED_RICH_TEXT_CACHE_MAX = 128
const sanitizedRichTextCache = new Map<string, string>()

function readCachedSanitizedRichTextHtml(html: string) {
  const cached = sanitizedRichTextCache.get(html)
  return cached ?? null
}

function writeCachedSanitizedRichTextHtml(html: string, sanitized: string) {
  if (sanitizedRichTextCache.size >= SANITIZED_RICH_TEXT_CACHE_MAX) {
    const first = sanitizedRichTextCache.keys().next().value
    if (first !== undefined) sanitizedRichTextCache.delete(first)
  }
  sanitizedRichTextCache.set(html, sanitized)
  return sanitized
}

function loadSanitizeHtmlModule() {
  sanitizeHtmlModulePromise ??= import('@/lib/sanitizeHtml')
  return sanitizeHtmlModulePromise
}

export function renderSanitizedHtml(html: string): ReactNode[] {
  if (typeof DOMParser === 'undefined') {
    return [textFromSanitizedHtml(html)]
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(parsed.body.childNodes).flatMap((node, index) => {
    const rendered = renderNode(node, `safe-html-${index}`)
    return rendered ? [rendered] : []
  })
}

export function textFromSanitizedHtml(html: string) {
  if (!html) return ''

  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return parsed.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function textFromRawHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function renderNode(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  const tagName = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes).map((child, index) => renderNode(child, `${key}-${index}`))

  if (!allowedElementTags.has(tagName)) {
    return <Fragment key={key}>{children}</Fragment>
  }

  const props: Record<string, string> & { key: string } = { key }
  const title = element.getAttribute('title')
  if (title) props.title = title

  if (tagName === 'a') {
    const href = element.getAttribute('href')
    if (href && isSafeLinkHref(href)) props.href = href
    const target = element.getAttribute('target')
    if (target === '_blank') {
      props.target = '_blank'
      props.rel = 'noopener noreferrer'
    }
  }

  return React.createElement(tagName, props, children)
}
