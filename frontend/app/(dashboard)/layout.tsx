import TopNav from '@/components/TopNav'
import AuthGuard from '@/components/AuthGuard'
import DashboardLayoutShell from '@/components/DashboardLayoutShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="figma-app">
        <TopNav />
        <DashboardLayoutShell>{children}</DashboardLayoutShell>
      </div>
    </AuthGuard>
  )
}
