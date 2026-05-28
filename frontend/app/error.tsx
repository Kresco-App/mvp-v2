'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'
import { reportClientError } from '@/lib/clientTelemetry'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
      eyebrow="Something went wrong"
      title="Kresco could not load this view."
      message="Refresh this view and try again."
      digest={error.digest}
      fullScreen
      homeHref="/"
      onRetry={reset}
    />
  )
}
