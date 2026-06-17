import AuthGuard from '@/components/AuthGuard'
import AdminTopNav from './AdminTopNav'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireStaff>
      <div className="min-h-screen bg-[#fbfbfc]">
        <AdminTopNav />
        {children}
      </div>
    </AuthGuard>
  )
}
