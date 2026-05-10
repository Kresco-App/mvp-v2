import TopNav from '@/components/TopNav'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="figma-app">
        <TopNav />
        <main>
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
