'use client'

import { useEffect } from 'react'
import { reportClientError, reportUnknownClientError } from '@/lib/clientTelemetry'

export default function ClientErrorReporter() {
  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      reportClientError({
        source: 'window-error',
        message: event.message || event.error?.message || 'Window error',
        stack: event.error?.stack,
        route: window.location.pathname,
      })
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      reportUnknownClientError('unhandled-rejection', event.reason)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
