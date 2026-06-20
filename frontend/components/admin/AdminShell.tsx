import AuthGuard from '@/components/AuthGuard'
import AdminTopNav from './AdminTopNav'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireStaff>
      <div className="min-h-screen bg-[#f6f7fb] text-[#202633]">
        <AdminTopNav />
        {children}
      </div>
    </AuthGuard>
  )
}
