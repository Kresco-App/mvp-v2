import AuthGuard from '@/components/AuthGuard'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireStaff>
      <ErrorBoundary
        eyebrow="Admin error"
        title="The admin workspace failed to load."
        message="Retry the admin workspace. Your staff session is kept intact."
        homeHref="/home"
      >
        {children}
      </ErrorBoundary>
    </AuthGuard>
  )
}
