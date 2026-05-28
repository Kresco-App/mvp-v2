'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function TopicWorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Topic error"
      title="The topic workspace failed to load."
      message="Retry this topic. The rest of your dashboard should remain available."
      digest={error.digest}
      homeHref="/home"
      homeLabel="Back home"
      onRetry={reset}
    />
  )
}
