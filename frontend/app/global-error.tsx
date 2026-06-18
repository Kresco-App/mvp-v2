'use client'

import { useEffect } from 'react'
import RouteErrorState from '@/components/RouteErrorState'
import { reportClientError } from '@/lib/clientTelemetry'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      source: 'next-global-error',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang="fr">
      <body>
        <RouteErrorState
          eyebrow="App error"
          title="Kresco could not recover this screen."
          message="Retry the app. Your session is kept intact when the browser still has the auth cookie."
          digest={error.digest}
          fullScreen
          homeHref="/home"
          onRetry={reset}
        />
      </body>
    </html>
  )
}
