import { getBackendUrl } from '@/lib/apiConfig'

type ClientErrorSource =
  | 'react-error-boundary'
  | 'next-segment-error'
  | 'next-global-error'
  | 'window-error'
  | 'unhandled-rejection'

type ClientErrorReport = {
  source: ClientErrorSource
  message: string
  route?: string
  digest?: string
  stack?: string
  component_stack?: string
}

const MAX_TEXT_LENGTH = 1000

export function reportClientError(report: ClientErrorReport) {
  if (typeof window === 'undefined') return

  const payload = JSON.stringify({
    source: bounded(report.source, 60),
    message: bounded(report.message || 'Unknown client error', MAX_TEXT_LENGTH),
    route: bounded(report.route ?? window.location.pathname, MAX_TEXT_LENGTH),
    digest: bounded(report.digest ?? '', 60),
    stack: bounded(report.stack ?? '', MAX_TEXT_LENGTH),
    component_stack: bounded(report.component_stack ?? '', MAX_TEXT_LENGTH),
    release_sha: bounded(document.documentElement.dataset.release ?? process.env.NEXT_PUBLIC_RELEASE_SHA ?? '', 60),
    user_agent: bounded(window.navigator.userAgent, MAX_TEXT_LENGTH),
  })
  const url = getBackendUrl('/api/client-errors')

  try {
    if (window.navigator.sendBeacon) {
      const sent = window.navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
      if (sent) return
    }
  } catch {
    // Fall back to fetch below.
  }

  void fetch(url, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined)
}

export function reportUnknownClientError(source: ClientErrorSource, value: unknown) {
  const error = normalizeError(value)
  reportClientError({
    source,
    message: error.message,
    stack: error.stack,
  })
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  try {
    return new Error(JSON.stringify(value))
  } catch {
    return new Error('Unknown client error')
  }
}

function bounded(value: string, maxLength: number) {
  return value.slice(0, maxLength)
}
