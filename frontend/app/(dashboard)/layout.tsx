import TopNav from '@/components/TopNav'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F8F9FF]">
        <TopNav />
        <main className="max-w-[1400px] mx-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
