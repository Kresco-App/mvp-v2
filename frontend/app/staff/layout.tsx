import AuthGuard from '@/components/AuthGuard'
import ApiDataProvider from '@/components/ApiDataProvider'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApiDataProvider>
      <AuthGuard requireStaff>
        <ErrorBoundary
          eyebrow="Staff workspace error"
          title="The staff workspace failed to load."
          message="Retry the workspace. Your staff session is kept intact."
          homeHref="/admin"
        >
          {children}
        </ErrorBoundary>
      </AuthGuard>
    </ApiDataProvider>
  )
}
