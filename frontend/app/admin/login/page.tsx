import { headers } from 'next/headers'

import WorkspaceLoginPage from '@/components/auth/WorkspaceLoginPage'

export default async function AdminLoginPage() {
  const requestHeaders = await headers()
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? ''

  return <WorkspaceLoginPage requestHost={requestHost} forcedWorkspace="admin" />
}
