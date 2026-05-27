'use client'

import AuthGuard from '@/components/AuthGuard'

export default function ProfessorAuthGate({ children }: { children: React.ReactNode }) {
  return <AuthGuard requireRole="professor">{children}</AuthGuard>
}
