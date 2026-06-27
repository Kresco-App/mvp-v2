import TopNav from '@/components/TopNav'
import AuthGuard from '@/components/AuthGuard'
import DashboardLayoutShell from '@/components/DashboardLayoutShell'
import ErrorBoundary from '@/components/ErrorBoundary'
import ApiDataProvider from '@/components/ApiDataProvider'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApiDataProvider>
      <AuthGuard>
        <div className="figma-app">
          <ErrorBoundary
            eyebrow="Navigation error"
            title="The dashboard navigation failed to load."
            message="Retry the navigation. The current view stays available."
            homeHref="/home"
          >
            <TopNav />
          </ErrorBoundary>
          <DashboardLayoutShell>
            <ErrorBoundary
              eyebrow="Dashboard widget error"
              title="This dashboard area failed to load."
              message="Retry this area. If it fails again, use another section while the issue is investigated."
              homeHref="/home"
            >
              {children}
            </ErrorBoundary>
          </DashboardLayoutShell>
        </div>
      </AuthGuard>
    </ApiDataProvider>
  )
}
