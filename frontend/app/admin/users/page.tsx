'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  XCircle,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
} from '@/components/admin/AdminDesign'
import { getJson, postJson } from '@/lib/apiClient'
import { formatMoneyCentimes, formatNumber, percent, recordEntries } from '@/lib/adminOverview'
import {
  EMPTY_ADMIN_USERS_ACCESS,
  activeUserRate,
  verifiedUserRate,
  type AdminPermissionMutationResponse,
  type AdminUserAccessRow,
  type AdminUserPermission,
  type AdminUsersAccess,
} from '@/lib/adminUsers'

const card = adminPanelClass

const statusLabels: Record<string, string> = {
  active: 'Active',
  admin: 'Admin',
  basic: 'Basic',
  expired: 'Expired',
  professor: 'Professor',
  pro: 'Pro',
  revoked: 'Revoked',
  staff: 'Staff',
  student: 'Student',
  vip: 'VIP',
}

const permissionOptions = [
  'audit:read',
  'content:write',
  'finance:export',
  'finance:manual_grant',
  'finance:payment_review',
  'finance:read',
  'finance:refund',
  'live:moderate',
  'roles:manage',
  'sqladmin:access',
  'support:reports',
  'users:read',
  'users:update',
  'xp:adjust',
]

export default function AdminUsersPage() {
  const [data, setData] = useState<AdminUsersAccess>(EMPTY_ADMIN_USERS_ACCESS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [permissionToGrant, setPermissionToGrant] = useState('users:read')
  const [permissionReason, setPermissionReason] = useState('Operational access update')
  const [permissionError, setPermissionError] = useState('')
  const [permissionBusy, setPermissionBusy] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    getJson<AdminUsersAccess>('/admin/users-access?limit=150')
      .then((response) => {
        if (!alive) return
        setData(response ?? EMPTY_ADMIN_USERS_ACCESS)
      })
      .catch(() => {
        if (!alive) return
        setData(EMPTY_ADMIN_USERS_ACCESS)
        setError('Could not load users and access.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [nonce])

  useEffect(() => {
    const targets = data.users.filter(isPermissionTarget)
    if (!targets.length) {
      if (selectedUserId) setSelectedUserId('')
      return
    }
    if (!targets.some((user) => String(user.user_id) === selectedUserId)) {
      setSelectedUserId(String(targets[0].user_id))
    }
  }, [data.users, selectedUserId])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredUsers = useMemo(
    () => data.users.filter((user) => matchesUser(user, normalizedQuery)),
    [data.users, normalizedQuery],
  )
  const permissionTargets = useMemo(() => data.users.filter(isPermissionTarget), [data.users])
  const selectedUser = permissionTargets.find((user) => String(user.user_id) === selectedUserId) ?? null
  const summary = data.summary
  const accessSignals = useMemo(() => buildAccessSignals(data.users), [data.users])

  async function handleGrantPermission() {
    if (!selectedUser) return
    const reason = permissionReason.trim()
    if (reason.length < 3) {
      setPermissionError('An audit reason is required.')
      return
    }
    setPermissionBusy('grant')
    setPermissionError('')
    try {
      const granted = await postJson<AdminPermissionMutationResponse>(
        '/admin/permissions',
        {
          user_id: selectedUser.user_id,
          permission: permissionToGrant,
          reason,
        },
      )
      setData((current) => applyPermissionMutation(current, granted))
      setPermissionReason('Operational access update')
    } catch {
      setPermissionError('Could not grant permission. Check target eligibility and your own roles:manage access.')
    } finally {
      setPermissionBusy('')
    }
  }

  async function handleRevokePermission(permission: AdminUserPermission) {
    setPermissionBusy(`revoke-${permission.id}`)
    setPermissionError('')
    try {
      const revoked = await postJson<AdminPermissionMutationResponse>(
        `/admin/permissions/${permission.id}/revoke`,
        { reason: 'Revoked from admin users board' },
      )
      setData((current) => applyPermissionMutation(current, revoked))
    } catch {
      setPermissionError('Could not revoke permission. The grant may already be locked or removed.')
    } finally {
      setPermissionBusy('')
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Users}
        eyebrow="Admin / Users"
        title="Users and access"
        description="Accounts, verification, staff roles, entitlements, permissions and paid access."
        syncLabel={data.generated_at ? `Last sync: ${new Date(data.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={<AdminRefreshButton loading={loading} onClick={() => setNonce((value) => value + 1)} />}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripClass}>
        <StatTile icon={Users} label="Users" value={formatNumber(summary.total_users)} hint={`${percent(activeUserRate(summary))} active`} loading={loading} />
        <StatTile icon={BadgeCheck} label="Verified" value={formatNumber(summary.verified_users)} hint={`${percent(verifiedUserRate(summary))} verified`} loading={loading} />
        <StatTile icon={ShieldCheck} label="Staff / pro" value={`${formatNumber(summary.staff_users)} / ${formatNumber(summary.pro_users)}`} hint={`${formatNumber(summary.active_permissions)} active permissions`} loading={loading} />
        <StatTile icon={Banknote} label="Paid access" value={formatMoneyCentimes(summary.paid_revenue_centimes)} hint={`${formatNumber(summary.paid_users)} paid users`} loading={loading} />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Account mix</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Roles and tiers represented in the user base.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Roles" data={recordEntries(data.users_by_role, 6)} emptyLabel="No role rows." />
            <BarList title="Tiers" data={recordEntries(data.users_by_tier, 6)} emptyLabel="No tier rows." />
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Access controls</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] font-semibold text-[#a1a1aa]">Entitlements and staff permissions by status.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Entitlements" data={recordEntries(data.entitlements_by_status, 6)} emptyLabel="No entitlement rows." />
            <BarList title="Permissions" data={recordEntries(data.permissions_by_status, 6)} emptyLabel="No permission rows." />
          </div>
        </section>
      </div>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Access risk</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
              Accounts that need staff review before support, billing, or role changes.
            </p>
          </div>
          <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-black text-[#f5900b]">
            {formatNumber(accessSignals.total)} signal(s)
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Unverified" value={formatNumber(accessSignals.unverified)} tone={accessSignals.unverified ? 'warn' : 'default'} />
            <MiniMetric label="Inactive" value={formatNumber(accessSignals.inactive)} tone={accessSignals.inactive ? 'warn' : 'default'} />
            <MiniMetric label="No login" value={formatNumber(accessSignals.neverLoggedIn)} tone={accessSignals.neverLoggedIn ? 'warn' : 'default'} />
            <MiniMetric label="Staff no perms" value={formatNumber(accessSignals.staffWithoutPermissions)} tone={accessSignals.staffWithoutPermissions ? 'warn' : 'default'} />
          </div>
          <BarList
            title="Risk mix"
            data={recordEntries({
              unverified: accessSignals.unverified,
              inactive: accessSignals.inactive,
              no_login: accessSignals.neverLoggedIn,
              staff_without_permissions: accessSignals.staffWithoutPermissions,
              paid_users: accessSignals.paidUsers,
            }, 6)}
            emptyLabel="No access risk rows."
          />
        </div>
      </section>

      <section className={`${card} mb-5 p-5`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[#5b60f9]">
              <KeyRound size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Permission management</h2>
              <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">
                Grant or revoke scoped staff permissions with an audit reason.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-[#f4f4f5] px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#71717a]">
            {formatNumber(permissionTargets.length)} eligible staff
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Staff user</span>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={!permissionTargets.length || loading}
                aria-label="Select staff user"
                className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition focus:border-[#5b60f9] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
              >
                {permissionTargets.map((user) => (
                  <option key={user.user_id} value={String(user.user_id)}>
                    {user.full_name || user.email} - {user.email}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Permission</span>
                <select
                  value={permissionToGrant}
                  onChange={(event) => setPermissionToGrant(event.target.value)}
                  disabled={!selectedUser || loading}
                  aria-label="Select permission"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition focus:border-[#5b60f9] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                >
                  {permissionOptions.map((permission) => (
                    <option key={permission} value={permission}>{formatPermission(permission)}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Audit reason</span>
                <input
                  value={permissionReason}
                  onChange={(event) => setPermissionReason(event.target.value)}
                  disabled={!selectedUser || loading}
                  aria-label="Permission audit reason"
                  className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition placeholder:text-[#c0c0c7] focus:border-[#5b60f9] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGrantPermission}
                disabled={!selectedUser || permissionBusy === 'grant' || loading}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#5b60f9] px-4 text-[13px] font-black text-white transition hover:bg-[#484cf0] disabled:cursor-not-allowed disabled:bg-[#c0c0c7]"
              >
                {permissionBusy === 'grant' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Grant permission
              </button>
              {permissionError && <span className="text-[12px] font-bold text-[#b45309]">{permissionError}</span>}
            </div>
          </div>

          <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] p-4">
            {selectedUser ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-black text-[#3f3f46]">{selectedUser.full_name || selectedUser.email}</p>
                    <p className="m-0 mt-0.5 truncate text-[12px] font-semibold text-[#a1a1aa]">{selectedUser.email}</p>
                  </div>
                  <Badge label={`${formatNumber(selectedUser.permissions?.length ?? 0)} active`} tone="accent" />
                </div>
                {(selectedUser.permissions ?? []).length ? (
                  <div className="grid gap-2">
                    {(selectedUser.permissions ?? []).map((permission) => (
                      <div
                        key={permission.id}
                        className="flex flex-col gap-2 rounded-[12px] border border-[#ececf0] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="m-0 text-[13px] font-black text-[#3f3f46]">{formatPermission(permission.permission)}</p>
                          <p className="m-0 mt-0.5 truncate text-[12px] font-semibold text-[#a1a1aa]">
                            {permission.reason || 'No reason recorded'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokePermission(permission)}
                          disabled={permissionBusy === `revoke-${permission.id}`}
                          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-[10px] border border-[#fee2e2] bg-[#fff7f7] px-3 text-[12px] font-black text-[#dc2626] transition hover:border-[#fecaca] hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {permissionBusy === `revoke-${permission.id}` ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[116px] place-items-center rounded-[12px] border border-dashed border-[#e4e4e7] bg-white px-4 text-center">
                    <p className="m-0 text-[13px] font-bold text-[#a1a1aa]">No active permissions for this staff user.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="grid min-h-[160px] place-items-center text-center">
                <p className="m-0 text-[13px] font-bold text-[#a1a1aa]">No active verified staff users are eligible for permission changes.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Users</h2>
            <p className="m-0 mt-0.5 text-[13px] font-semibold text-[#a1a1aa]">{formatNumber(filteredUsers.length)} row(s) visible</p>
          </div>
          <AdminSearchBox value={query} onChange={setQuery} placeholder="Search users" label="Search admin users" className="lg:w-[340px]" />
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : filteredUsers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-[#fbfbfc]">
                <tr className="text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
                  <th className="px-5 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Entitlements</th>
                  <th className="px-4 py-3">Payments</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => <UserRow key={user.user_id} user={user} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center p-8 text-center">
            <div>
              <UserRound size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">No users found.</p>
              <p className="m-0 mt-1 text-[13px] font-semibold text-[#a1a1aa]">Try another search or refresh the access view.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint: string
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#f0f0ff] text-[#5b60f9]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46]">{loading ? '-' : value}</p>
      <p className="m-0 mt-1 text-[12px] font-bold text-[#a1a1aa]">{hint}</p>
    </div>
  )
}

function BarList({ title, data, emptyLabel }: { title: string; data: Array<{ key: string; value: number }>; emptyLabel: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div>
      <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
      {!data.length ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[#e4e4e7] px-3 py-4 text-center text-[13px] font-semibold text-[#a1a1aa]">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2.5">
          {data.map((item) => {
            const width = Math.max(5, Math.round((item.value / max) * 100))
            return (
              <div key={item.key}>
                <div className="mb-1 flex justify-between gap-3 text-[12.5px] font-bold">
                  <span className="text-[#52525c]">{statusLabels[item.key] ?? item.key}</span>
                  <span className="text-[#a1a1aa]">{formatNumber(item.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f4f4f5]">
                  <div className="h-full rounded-full bg-[#5b60f9]" style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'warn' ? 'text-[#f5900b]' : tone === 'good' ? 'text-[#16a34a]' : 'text-[#3f3f46]'
  return (
    <div className="rounded-[12px] border border-[#f4f4f5] bg-[#fbfbfc] px-3 py-2.5">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</p>
      <p className={`m-0 mt-1 text-[18px] font-black leading-none ${toneClass}`}>{value}</p>
    </div>
  )
}

function UserRow({ user }: { user: AdminUserAccessRow }) {
  return (
    <tr className="border-t border-[#f4f4f5] text-[13px]">
      <td className="px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f0ff] text-[13px] font-black text-[#5b60f9]">
            {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || <UserRound size={16} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black text-[#3f3f46]">{user.full_name || user.email}</span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">{user.email}</span>
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{statusLabels[user.role] ?? user.role}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{user.niveau || 'Niveau -'} / {user.filiere || 'Filiere -'}</p>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge label={user.tier} tone={user.is_pro ? 'good' : 'default'} />
          {user.is_staff && <Badge label="staff" tone="accent" />}
          {user.is_superuser && <Badge label="super" tone="warn" />}
          {user.is_email_verified ? <Badge label="verified" tone="good" /> : <Badge label="unverified" tone="warn" />}
          {!user.is_active && <Badge label="inactive" tone="warn" />}
        </div>
        {!!user.active_permission_names?.length && (
          <div className="mt-2 flex max-w-[300px] flex-wrap gap-1.5">
            {user.active_permission_names.slice(0, 3).map((permission) => (
              <Badge key={permission} label={formatPermission(permission)} tone="default" />
            ))}
            {user.active_permission_names.length > 3 && (
              <Badge label={`+${user.active_permission_names.length - 3}`} tone="default" />
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatNumber(user.active_entitlements)} active</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(user.total_entitlements)} total / {formatNumber(user.active_permissions)} perms</p>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatMoneyCentimes(user.paid_revenue_centimes)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{formatNumber(user.payment_count)} payment(s)</p>
      </td>
      <td className="px-4 py-4">
        <p className="m-0 font-black text-[#3f3f46]">{formatDate(user.last_login) || 'No login'}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">Created {formatDate(user.created_at) || '-'}</p>
      </td>
    </tr>
  )
}

function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'good' | 'warn' | 'accent' }) {
  const toneClass = tone === 'good'
    ? 'bg-[#f0fdf4] text-[#16a34a]'
    : tone === 'warn'
      ? 'bg-[#fff7ed] text-[#f5900b]'
      : tone === 'accent'
        ? 'bg-[#f0f0ff] text-[#5b60f9]'
        : 'bg-[#f4f4f5] text-[#71717a]'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${toneClass}`}>{label}</span>
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 animate-pulse rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-56 animate-pulse rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 animate-pulse rounded-full bg-[#f4f4f5] sm:block" />
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('fr-FR')
}

function matchesUser(user: AdminUserAccessRow, query: string) {
  if (!query) return true
  return [
    user.full_name,
    user.email,
    user.role,
    user.tier,
    user.niveau,
    user.filiere,
    user.is_staff ? 'staff' : '',
    user.is_pro ? 'pro' : '',
    ...(user.active_permission_names ?? []),
  ].join(' ').toLowerCase().includes(query)
}

function isPermissionTarget(user: AdminUserAccessRow) {
  return user.is_staff && user.is_active && user.is_email_verified
}

function buildAccessSignals(users: AdminUserAccessRow[]) {
  const unverified = users.filter((user) => !user.is_email_verified).length
  const inactive = users.filter((user) => !user.is_active).length
  const neverLoggedIn = users.filter((user) => !user.last_login).length
  const staffWithoutPermissions = users.filter((user) => user.is_staff && user.active_permissions === 0).length
  const paidUsers = users.filter((user) => user.paid_revenue_centimes > 0 || user.payment_count > 0).length

  return {
    unverified,
    inactive,
    neverLoggedIn,
    staffWithoutPermissions,
    paidUsers,
    total: unverified + inactive + neverLoggedIn + staffWithoutPermissions,
  }
}

function formatPermission(permission: string) {
  return permission
    .split(':')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ')
}

function applyPermissionMutation(
  data: AdminUsersAccess,
  permission: AdminPermissionMutationResponse,
): AdminUsersAccess {
  let activeDelta = 0
  const users = data.users.map((user) => {
    if (user.user_id !== permission.user_id) return user

    const existingPermissions = user.permissions ?? []
    const existingIndex = existingPermissions.findIndex(
      (item) => item.id === permission.id || item.permission === permission.permission,
    )
    let nextPermissions = existingPermissions
    if (permission.status === 'active') {
      const nextPermission = {
        id: permission.id,
        permission: permission.permission,
        reason: permission.reason,
        created_at: permission.created_at,
      }
      if (existingIndex >= 0) {
        nextPermissions = existingPermissions.map((item, index) => (
          index === existingIndex ? nextPermission : item
        ))
      } else {
        nextPermissions = [...existingPermissions, nextPermission]
        activeDelta += 1
      }
    } else if (existingIndex >= 0) {
      nextPermissions = existingPermissions.filter((_, index) => index !== existingIndex)
      activeDelta -= 1
    }

    return {
      ...user,
      permissions: nextPermissions,
      active_permissions: nextPermissions.length,
      active_permission_names: nextPermissions.map((item) => item.permission),
    }
  })

  if (!activeDelta) return { ...data, users }

  return {
    ...data,
    users,
    summary: {
      ...data.summary,
      active_permissions: Math.max(0, data.summary.active_permissions + activeDelta),
    },
    permissions_by_status: {
      ...data.permissions_by_status,
      active: Math.max(0, (data.permissions_by_status.active ?? 0) + activeDelta),
    },
  }
}
