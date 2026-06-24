import DOMPurify from 'isomorphic-dompurify'

import { isSafeLinkHref } from '@/lib/urlSafety'

const allowedTags = [
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
]

const allowedAttributes = ['href', 'rel', 'target', 'title']

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'A') return

  const element = node as Element
  const href = element.getAttribute('href')
  if (href && !isSafeLinkHref(href)) {
    element.removeAttribute('href')
  }

  const target = element.getAttribute('target')
  if (target && target !== '_blank') {
    element.removeAttribute('target')
  }

  if (element.getAttribute('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeHtml(value: string) {
  return DOMPurify.sanitize(value, {
    ALLOW_DATA_ATTR: false,
    ALLOWED_ATTR: allowedAttributes,
    ALLOWED_TAGS: allowedTags,
    FORBID_ATTR: ['style', 'srcdoc'],
    FORBID_TAGS: ['embed', 'form', 'iframe', 'math', 'object', 'script', 'select', 'style', 'svg', 'textarea'],
  })
}
