import AdminUsersPage from '@/app/admin/users/page'

export default async function AdminUsersStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  return <AdminUsersPage view="students" studentMode="detail" studentId={studentId} />
}
