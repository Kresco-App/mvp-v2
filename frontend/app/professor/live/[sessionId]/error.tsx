'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function ProfessorLiveError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Live control error"
      title="The live control room failed to load."
      message="Retry the control room. Session actions should not collapse into a blank page."
      digest={error.digest}
      homeHref="/professor"
      homeLabel="Back to professor"
      onRetry={reset}
    />
  )
}
