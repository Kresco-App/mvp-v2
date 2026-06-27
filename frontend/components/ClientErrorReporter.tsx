'use client'

import { useEffect } from 'react'

type ClientTelemetryModule = typeof import('@/lib/clientTelemetry')

let clientTelemetryModulePromise: Promise<ClientTelemetryModule> | null = null

function loadClientTelemetry() {
  clientTelemetryModulePromise ??= import('@/lib/clientTelemetry')
  return clientTelemetryModulePromise
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const handledUnhandledRejections = new WeakSet<PromiseRejectionEvent>()
    const previousUnhandledRejection = window.onunhandledrejection

    function handleWindowError(event: ErrorEvent) {
      void loadClientTelemetry().then(({ reportClientError }) => {
        reportClientError({
          source: 'window-error',
          message: event.message || event.error?.message || 'Window error',
          stack: event.error?.stack,
          route: window.location.pathname,
        })
      })
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (handledUnhandledRejections.has(event)) return
      handledUnhandledRejections.add(event)
      void loadClientTelemetry().then(({ reportUnknownClientError }) => {
        reportUnknownClientError('unhandled-rejection', event.reason)
      })
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.onunhandledrejection = (event) => {
      if (typeof previousUnhandledRejection === 'function') previousUnhandledRejection.call(window, event)
      handleUnhandledRejection(event)
    }
    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      if (window.onunhandledrejection !== previousUnhandledRejection) {
        window.onunhandledrejection = previousUnhandledRejection
      }
    }
  }, [])

  return null
}
