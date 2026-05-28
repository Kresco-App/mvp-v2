'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function ProfessorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Professor workspace error"
      title="The professor workspace failed to load."
      message="Retry the professor workspace. Live or chat actions should not disappear into a blank page."
      digest={error.digest}
      homeHref="/professor"
      onRetry={reset}
    />
  )
}
