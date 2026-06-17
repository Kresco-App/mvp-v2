'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'
import { reportClientError } from '@/lib/clientTelemetry'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      source: 'next-segment-error',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    })
  }, [error])

  return (
    <RouteErrorState
      eyebrow="Dashboard error"
      title="This dashboard view failed to load."
      message="Retry this view. Your session and the rest of the app remain available."
      digest={error.digest}
      centered
      homeHref="/home"
      onRetry={reset}
    />
  )
}
