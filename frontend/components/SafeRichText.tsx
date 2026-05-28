'use client'

import React, { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'

import { sanitizeHtml } from '@/lib/sanitizeHtml'

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

const allowedHrefPattern = /^(https?:|mailto:|#|\/)/i

type SafeRichTextProps = {
  html: string
  fallbackText?: string
}

export default function SafeRichText({ html, fallbackText = '' }: SafeRichTextProps) {
  const [mounted, setMounted] = useState(false)
  const sanitized = useMemo(() => sanitizeHtml(html), [html])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof DOMParser === 'undefined') {
    return <>{textFromSanitizedHtml(sanitized) || fallbackText}</>
  }

  const rendered = renderSanitizedHtml(sanitized)
  return <>{rendered.length > 0 ? rendered : fallbackText}</>
}

export function renderSanitizedHtml(html: string): ReactNode[] {
  if (typeof DOMParser === 'undefined') {
    return [textFromSanitizedHtml(html)]
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(parsed.body.childNodes).map((node, index) => renderNode(node, `safe-html-${index}`)).filter(Boolean)
}

export function textFromSanitizedHtml(html: string) {
  if (!html) return ''

  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return parsed.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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
    if (href && allowedHrefPattern.test(href)) props.href = href
    const target = element.getAttribute('target')
    if (target === '_blank') {
      props.target = '_blank'
      props.rel = 'noopener noreferrer'
    }
  }

  return React.createElement(tagName, props, children)
}
