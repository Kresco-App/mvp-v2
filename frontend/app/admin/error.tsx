'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Admin error"
      title="The admin workspace failed to load."
      message="Retry the admin workspace. Your staff session is kept intact."
      digest={error.digest}
      homeHref="/home"
      onRetry={reset}
    />
  )
}
