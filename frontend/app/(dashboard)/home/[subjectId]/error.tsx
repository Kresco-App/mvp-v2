'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function SubjectDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Subject error"
      title="The subject page failed to load."
      message="Retry this subject. Your dashboard session remains available."
      digest={error.digest}
      homeHref="/home"
      homeLabel="Back home"
      onRetry={reset}
    />
  )
}
