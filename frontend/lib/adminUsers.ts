export type AdminUsersAccessSummary = {
  total_users: number
  active_users: number
  verified_users: number
  staff_users: number
  pro_users: number
  active_entitlements: number
  users_with_active_entitlements: number
  active_permissions: number
  paid_users: number
  paid_revenue_centimes: number
}

export type AdminUserAccessRow = {
  user_id: number
  full_name: string
  email: string
  role: string
  tier: string
  niveau: string
  filiere: string
  is_active: boolean
  is_email_verified: boolean
  is_staff: boolean
  is_superuser: boolean
  is_pro: boolean
  active_entitlements: number
  total_entitlements: number
  active_permissions: number
  active_permission_names: string[]
  permissions: AdminUserPermission[]
  payment_count: number
  paid_revenue_centimes: number
  latest_payment_at: string | null
  last_login: string | null
  created_at: string | null
}

export type AdminUserPermission = {
  id: number
  permission: string
  reason: string
  created_at: string | null
}

export type AdminPermissionMutationResponse = {
  id: number
  user_id: number
  permission: string
  status: 'active' | 'revoked'
  reason: string
  granted_by_user_id: number | null
  created_at: string
  revoked_at: string | null
}

export type AdminUsersAccess = {
  generated_at: string
  summary: AdminUsersAccessSummary
  users_by_role: Record<string, number>
  users_by_tier: Record<string, number>
  entitlements_by_status: Record<string, number>
  permissions_by_status: Record<string, number>
  users: AdminUserAccessRow[]
}

export const EMPTY_ADMIN_USERS_ACCESS: AdminUsersAccess = {
  generated_at: '',
  summary: {
    total_users: 0,
    active_users: 0,
    verified_users: 0,
    staff_users: 0,
    pro_users: 0,
    active_entitlements: 0,
    users_with_active_entitlements: 0,
    active_permissions: 0,
    paid_users: 0,
    paid_revenue_centimes: 0,
  },
  users_by_role: {},
  users_by_tier: {},
  entitlements_by_status: {},
  permissions_by_status: {},
  users: [],
}

export function activeUserRate(summary: AdminUsersAccessSummary) {
  if (!summary.total_users) return 0
  return Math.round((summary.active_users / summary.total_users) * 100)
}

export function verifiedUserRate(summary: AdminUsersAccessSummary) {
  if (!summary.total_users) return 0
  return Math.round((summary.verified_users / summary.total_users) * 100)
}
