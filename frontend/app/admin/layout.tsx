import AdminShell from '@/components/admin/AdminShell'
import ApiDataProvider from '@/components/ApiDataProvider'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApiDataProvider>
      <AdminShell>
        <ErrorBoundary
          eyebrow="Admin error"
          title="The admin workspace failed to load."
          message="Retry the admin workspace. Your staff session is kept intact."
          homeHref="/home"
        >
          {children}
        </ErrorBoundary>
      </AdminShell>
    </ApiDataProvider>
  )
}
