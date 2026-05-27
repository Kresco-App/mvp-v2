'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function WatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Watch error"
      title="The lesson player failed to load."
      message="Retry the lesson. Your session and course navigation remain available."
      digest={error.digest}
      fullScreen
      homeHref="/home"
      onRetry={reset}
    />
  )
}
