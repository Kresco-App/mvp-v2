import TopNav from '@/components/TopNav'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen surface-page text-page-primary">
        <TopNav />
        <main>
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
