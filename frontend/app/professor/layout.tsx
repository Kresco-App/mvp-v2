import ErrorBoundary from '@/components/ErrorBoundary'

export default function ProfessorRouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      eyebrow="Professor workspace error"
      title="The professor workspace failed to load."
      message="Retry the professor workspace. Live or chat actions should not disappear into a blank page."
      homeHref="/professor"
    >
      {children}
    </ErrorBoundary>
  )
}
