'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function ExamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      eyebrow="Exam error"
      title="The exam page failed to load."
      message="Retry this exam. You can also return home without losing your session."
      digest={error.digest}
      fullScreen
      homeHref="/home"
      homeLabel="Back home"
      onRetry={reset}
    />
  )
}
