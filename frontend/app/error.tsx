'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
