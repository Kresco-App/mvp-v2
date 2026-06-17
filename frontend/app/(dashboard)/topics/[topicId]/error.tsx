'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'
import { reportClientError } from '@/lib/clientTelemetry'

export default function TopicWorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
      eyebrow="Topic unavailable"
      title="This lesson could not be opened."
      message="Retry the lesson. Your dashboard and other course areas should remain available."
      digest={error.digest}
      centered
      homeHref="/home"
      homeLabel="Back home"
      onRetry={reset}
    />
  )
}
