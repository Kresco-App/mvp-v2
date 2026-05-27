'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Dashboard error"
      title="This dashboard view failed to load."
      message="Try loading it again."
      digest={error.digest}
      homeHref="/home"
      onRetry={reset}
    />
  )
}
