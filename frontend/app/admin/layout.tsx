import AuthGuard from '@/components/AuthGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requireStaff>{children}</AuthGuard>
}
