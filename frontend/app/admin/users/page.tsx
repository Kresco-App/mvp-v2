'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Crown,
  GraduationCap,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UserCheck,
  UserRound,
  UserX,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import {
  AdminAlert,
  AdminPageHeader,
  AdminRefreshButton,
  AdminSearchBox,
  AdminTable,
  adminMetricStripClass,
  adminMetricTileClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminTableCellClass,
  adminTableHeadCellClass,
  adminTableHeadClass,
  adminTableHeadRowClass,
  adminTableRowClass,
  adminTableActionButtonClass,
  AdminTableActionButton,
} from '@/components/admin/AdminDesign'
import { getJson, patchJson, postJson } from '@/lib/apiClient'
import { formatMoneyCentimes, formatNumber, recordEntries } from '@/lib/adminOverview'
import {
  type AdminManualAccessGrant,
  type AdminManualAccessGrantInput,
  EMPTY_ADMIN_USERS_ACCESS,
  type AdminStudentAccountCreateInput,
  type AdminPermissionMutationResponse,
  type AdminStudentAccountUpdateInput,
  type AdminUserAccessRow,
  type AdminUserPermission,
  type AdminUsersAccess,
} from '@/lib/adminUsers'
import type { CourseSubject } from '@/lib/courseDiscoveryData'

export type AdminUsersView = 'overview' | 'students' | 'staff'
type StudentPageMode = 'list' | 'detail' | 'create'

const card = adminPanelClass
const controlClass = 'h-11 w-full min-w-0 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[background-color,border-color,color] duration-150 ease-out placeholder:text-[#c0c0c7] focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]'
const labelClass = 'text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]'
const studentTierOptions = ['basic', 'pro', 'vip'] as const
type StudentEditorMode = 'edit' | 'create'
type StudentAccessDraft = {
  subject_id: string
  action: AdminManualAccessGrantInput['action']
  duration_days: number
  reason: string
}
type StudentOperatorAction = {
  icon: LucideIcon
  label: string
  value: string
  href: string
  tone: 'accent' | 'good' | 'warn'
}

const emptyStudentDraft: AdminStudentAccountUpdateInput = {
  full_name: '',
  email: '',
  niveau: '',
  filiere: '',
  tier: 'basic',
  is_active: true,
  is_email_verified: false,
}

const emptyStudentAccessDraft: StudentAccessDraft = {
  subject_id: '',
  action: 'grant',
  duration_days: 30,
  reason: 'Manual access update',
}

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
  'finance:staff_codes',
  'live:moderate',
  'roles:manage',
  'sqladmin:access',
  'support:reports',
  'users:read',
  'users:update',
  'xp:adjust',
]

export default function AdminUsersPage({
  view = 'overview',
  studentMode,
  studentId,
}: {
  view?: AdminUsersView
  studentMode?: StudentPageMode
  studentId?: string
} = {}) {
  const resolvedStudentMode: StudentPageMode = view === 'students' ? studentMode ?? 'list' : 'list'
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
  const [selectedStudentId, setSelectedStudentId] = useState(studentId ?? '')
  const [studentEditorMode, setStudentEditorMode] = useState<StudentEditorMode>(resolvedStudentMode === 'create' ? 'create' : 'edit')
  const [studentDraft, setStudentDraft] = useState<AdminStudentAccountUpdateInput | null>(null)
  const [studentBusy, setStudentBusy] = useState('')
  const [studentError, setStudentError] = useState('')
  const [studentSaved, setStudentSaved] = useState('')
  const [subjects, setSubjects] = useState<CourseSubject[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [manualAccessGrants, setManualAccessGrants] = useState<AdminManualAccessGrant[]>([])
  const [manualAccessLoading, setManualAccessLoading] = useState(false)
  const [manualAccessBusy, setManualAccessBusy] = useState('')
  const [manualAccessError, setManualAccessError] = useState('')
  const [manualAccessDraft, setManualAccessDraft] = useState<StudentAccessDraft>(emptyStudentAccessDraft)

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
    if (view !== 'students' || resolvedStudentMode === 'list') return
    let alive = true
    setSubjectsLoading(true)
    getJson<CourseSubject[]>('/courses/subjects?limit=100')
      .then((response) => {
        if (!alive) return
        setSubjects(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (alive) setSubjects([])
      })
      .finally(() => {
        if (alive) setSubjectsLoading(false)
      })
    return () => { alive = false }
  }, [resolvedStudentMode, view])

  const studentAccounts = useMemo(() => data.users.filter(isStudentAccount), [data.users])
  const staffAccounts = useMemo(() => data.users.filter((user) => user.is_staff), [data.users])
  const permissionTargets = useMemo(() => staffAccounts.filter(isPermissionTarget), [staffAccounts])

  useEffect(() => {
    if (!permissionTargets.length) {
      if (selectedUserId) setSelectedUserId('')
      return
    }
    if (!permissionTargets.some((user) => String(user.user_id) === selectedUserId)) {
      setSelectedUserId(String(permissionTargets[0].user_id))
    }
  }, [permissionTargets, selectedUserId])

  useEffect(() => {
    if (view !== 'students' || loading) return
    if (resolvedStudentMode === 'create') {
      setStudentEditorMode('create')
      setSelectedStudentId('')
      return
    }
    if (resolvedStudentMode === 'detail') {
      setStudentEditorMode('edit')
      if (studentId && selectedStudentId !== studentId) setSelectedStudentId(studentId)
      return
    }
    if (resolvedStudentMode === 'list' || studentEditorMode === 'create') return
    if (!studentAccounts.length) {
      if (selectedStudentId) setSelectedStudentId('')
      setStudentEditorMode('create')
      return
    }
    if (!studentAccounts.some((user) => String(user.user_id) === selectedStudentId)) {
      setSelectedStudentId(String(studentAccounts[0].user_id))
    }
  }, [loading, resolvedStudentMode, selectedStudentId, studentAccounts, studentEditorMode, studentId, view])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleUsers = view === 'staff' ? staffAccounts : studentAccounts
  const filteredUsers = useMemo(
    () => visibleUsers.filter((user) => matchesUser(user, normalizedQuery)),
    [visibleUsers, normalizedQuery],
  )
  const selectedUser = permissionTargets.find((user) => String(user.user_id) === selectedUserId) ?? null
  const selectedStudent = studentAccounts.find((user) => String(user.user_id) === selectedStudentId) ?? null
  const accessSignals = useMemo(() => buildAccessSignals(studentAccounts, staffAccounts), [studentAccounts, staffAccounts])
  const summary = data.summary

  useEffect(() => {
    if (!subjects.length) return
    setManualAccessDraft((current) => (
      current.subject_id ? current : { ...current, subject_id: String(subjects[0].id) }
    ))
  }, [subjects])

  useEffect(() => {
    if (view !== 'students' || resolvedStudentMode === 'list' || studentEditorMode === 'create' || !selectedStudentId) {
      setManualAccessGrants([])
      return
    }
    let alive = true
    setManualAccessLoading(true)
    setManualAccessError('')
    getJson<AdminManualAccessGrant[]>(
      `/payments/finance/manual-access-grants?user_id=${encodeURIComponent(selectedStudentId)}&limit=8`,
    )
      .then((response) => {
        if (!alive) return
        setManualAccessGrants(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (!alive) return
        setManualAccessGrants([])
        setManualAccessError('Could not load access changes.')
      })
      .finally(() => {
        if (alive) setManualAccessLoading(false)
      })
    return () => { alive = false }
  }, [resolvedStudentMode, selectedStudentId, studentEditorMode, view])

  useEffect(() => {
    if (studentEditorMode === 'create') {
      setStudentDraft((current) => current ?? emptyStudentDraft)
      return
    }
    if (!selectedStudent) {
      setStudentDraft(null)
      return
    }
    setStudentDraft(studentDraftFromUser(selectedStudent))
  }, [selectedStudent, studentEditorMode])

  async function handleGrantPermission() {
    if (!selectedUser) return
    const reason = permissionReason.trim()
    if (reason.length < 3) {
      setPermissionError('Audit reason required.')
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
      setPermissionError('Could not grant permission.')
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
      setPermissionError('Could not revoke permission.')
    } finally {
      setPermissionBusy('')
    }
  }

  function handleStudentDraftChange<Key extends keyof AdminStudentAccountUpdateInput>(
    key: Key,
    value: AdminStudentAccountUpdateInput[Key],
  ) {
    setStudentDraft((current) => current ? { ...current, [key]: value } : current)
    setStudentError('')
    setStudentSaved('')
  }

  async function handleSaveStudent() {
    if (!studentDraft) return
    const validationError = validateStudentDraft(studentDraft)
    if (validationError) {
      setStudentError(validationError)
      setStudentSaved('')
      return
    }
    setStudentBusy('save')
    setStudentError('')
    setStudentSaved('')
    try {
      if (studentEditorMode === 'create') {
        const created = await postJson<AdminUserAccessRow, AdminStudentAccountCreateInput>(
          '/admin/users-access/students',
          normalizeStudentCreateDraft(studentDraft),
        )
        setData((current) => applyStudentAccountCreate(current, created))
        setStudentEditorMode('edit')
        setSelectedStudentId(String(created.user_id))
        setStudentDraft(studentDraftFromUser(created))
        setStudentSaved('Created')
      } else if (selectedStudent) {
        const updated = await patchJson<AdminUserAccessRow, AdminStudentAccountUpdateInput>(
          `/admin/users-access/students/${selectedStudent.user_id}`,
          normalizeStudentDraft(studentDraft),
        )
        setData((current) => applyStudentAccountMutation(current, updated))
        setStudentDraft(studentDraftFromUser(updated))
        setStudentSaved('Saved')
      }
    } catch {
      setStudentError(studentEditorMode === 'create' ? 'Could not create student account.' : 'Could not save student account.')
    } finally {
      setStudentBusy('')
    }
  }

  function handleResetStudent() {
    if (studentEditorMode === 'create') {
      setStudentDraft(emptyStudentDraft)
      setStudentError('')
      setStudentSaved('')
      return
    }
    if (!selectedStudent) return
    setStudentDraft(studentDraftFromUser(selectedStudent))
    setStudentError('')
    setStudentSaved('')
  }

  async function handleQuickStudentPatch(
    updates: AdminStudentAccountUpdateInput,
    busyKey: string,
    successLabel: string,
  ) {
    if (!selectedStudent) return
    setStudentEditorMode('edit')
    setStudentBusy(busyKey)
    setStudentError('')
    setStudentSaved('')
    try {
      const updated = await patchJson<AdminUserAccessRow, AdminStudentAccountUpdateInput>(
        `/admin/users-access/students/${selectedStudent.user_id}`,
        updates,
      )
      setData((current) => applyStudentAccountMutation(current, updated))
      setSelectedStudentId(String(updated.user_id))
      setStudentDraft(studentDraftFromUser(updated))
      setStudentSaved(successLabel)
    } catch {
      setStudentError('Could not update student account.')
    } finally {
      setStudentBusy('')
    }
  }

  async function handleSendStudentPasswordReset() {
    if (!selectedStudent?.email) return
    setStudentBusy('password-reset')
    setStudentError('')
    setStudentSaved('')
    try {
      const { sendFirebasePasswordReset } = await import('@/lib/firebaseAuth')
      await sendFirebasePasswordReset(selectedStudent.email)
      setStudentSaved('Reset email sent')
    } catch {
      setStudentError('Could not send reset email.')
    } finally {
      setStudentBusy('')
    }
  }

  function handleManualAccessDraftChange<Key extends keyof StudentAccessDraft>(
    key: Key,
    value: StudentAccessDraft[Key],
  ) {
    setManualAccessDraft((current) => ({ ...current, [key]: value }))
    setManualAccessError('')
    setStudentSaved('')
  }

  async function handleManualAccessSubmit() {
    if (!selectedStudent) return
    const subjectId = Number(manualAccessDraft.subject_id)
    const reason = manualAccessDraft.reason.trim()
    if (!Number.isFinite(subjectId) || subjectId <= 0) {
      setManualAccessError('Choose a subject.')
      return
    }
    if (reason.length < 3) {
      setManualAccessError('Reason required.')
      return
    }

    const action = manualAccessDraft.action
    const body: AdminManualAccessGrantInput = {
      user_id: selectedStudent.user_id,
      subject_id: subjectId,
      action,
      reason,
    }

    if (action === 'grant') {
      const durationDays = Math.max(1, Math.min(730, Number(manualAccessDraft.duration_days) || 30))
      const startsAt = new Date()
      const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
      body.starts_at = startsAt.toISOString()
      body.ends_at = endsAt.toISOString()
    }

    setManualAccessBusy(action)
    setManualAccessError('')
    setStudentSaved('')
    try {
      const record = await postJson<AdminManualAccessGrant, AdminManualAccessGrantInput>(
        '/payments/finance/manual-access-grants',
        body,
      )
      setManualAccessGrants((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 8))
      setData((current) => applyManualAccessGrantToData(current, selectedStudent.user_id, record))
      setStudentSaved(record.status === 'completed' ? 'Access updated' : 'No change')
    } catch {
      setManualAccessError('Could not update access.')
    } finally {
      setManualAccessBusy('')
    }
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={view === 'staff' ? UserCog : view === 'students' ? Users : ShieldCheck}
        title={view === 'staff' ? 'Staff management' : view === 'students' ? 'Student accounts' : 'Users and access'}
        syncLabel={data.generated_at ? `Last sync: ${new Date(data.generated_at).toLocaleString('fr-FR')}` : undefined}
        action={(
          <>
            {view === 'students' && resolvedStudentMode !== 'create' && (
              <a href="/admin/users/students/new" className={adminPrimaryButtonClass}>
                <Plus size={15} aria-hidden="true" />
                New student
              </a>
            )}
            {view === 'students' && resolvedStudentMode !== 'list' && (
              <a href="/admin/users/students" className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-card)] px-4 text-[13px] font-black text-[color:var(--text-secondary)] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96]">
                <ChevronRight size={15} className="rotate-180" aria-hidden="true" />
                Students
              </a>
            )}
            <AdminRefreshButton loading={loading} onClick={() => setNonce((value) => value + 1)} />
          </>
        )}
      />

      {error && (
        <AdminAlert>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      {view === 'overview' && (
        <>
          <section className={adminMetricStripClass}>
            <StatTile icon={Users} label="Student accounts" value={formatNumber(summary.total_users)} loading={loading} />
            <StatTile icon={BadgeCheck} label="Verified students" value={formatNumber(summary.verified_users)} loading={loading} />
            <StatTile icon={UserCog} label="Staff accounts" value={formatNumber(summary.staff_users)} loading={loading} />
            <StatTile icon={Banknote} label="Paid access" value={formatMoneyCentimes(summary.paid_revenue_centimes)} loading={loading} />
          </section>

          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className={`${card} p-5`}>
              <h2 className="m-0 mb-4 text-[16px] font-black text-[#3f3f46]">Account mix</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <CountList title="Roles" data={recordEntries(data.users_by_role, 6)} />
                <CountList title="Tiers" data={recordEntries(data.users_by_tier, 6)} />
              </div>
            </section>

            <section className={`${card} p-5`}>
              <h2 className="m-0 mb-4 text-[16px] font-black text-[#3f3f46]">Access controls</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <CountList title="Entitlements" data={recordEntries(data.entitlements_by_status, 6)} />
                <CountList title="Permissions" data={recordEntries(data.permissions_by_status, 6)} />
              </div>
            </section>
          </div>

          <AccessRiskPanel signals={accessSignals} />
        </>
      )}

      {view === 'students' && (
        resolvedStudentMode === 'list' ? (
          <StudentAccountsTable
            users={filteredUsers}
            studentOptions={studentAccounts}
            query={query}
            loading={loading}
            onQueryChange={setQuery}
          />
        ) : (
          <StudentRecordWorkspace
            mode={studentEditorMode}
            selectedStudent={selectedStudent}
            studentDraft={studentDraft}
            loading={loading}
            busy={studentBusy}
            error={studentError}
            saved={studentSaved}
            subjects={subjects}
            subjectsLoading={subjectsLoading}
            manualAccessGrants={manualAccessGrants}
            manualAccessLoading={manualAccessLoading}
            manualAccessBusy={manualAccessBusy}
            manualAccessError={manualAccessError}
            manualAccessDraft={manualAccessDraft}
            onStudentDraftChange={handleStudentDraftChange}
            onSaveStudent={handleSaveStudent}
            onResetStudent={handleResetStudent}
            onQuickStudentPatch={handleQuickStudentPatch}
            onSendPasswordReset={handleSendStudentPasswordReset}
            onManualAccessDraftChange={handleManualAccessDraftChange}
            onManualAccessSubmit={handleManualAccessSubmit}
          />
        )
      )}

      {view === 'staff' && (
        <>
          <PermissionsPanel
            selectedUser={selectedUser}
            selectedUserId={selectedUserId}
            permissionTargets={permissionTargets}
            permissionToGrant={permissionToGrant}
            permissionReason={permissionReason}
            permissionBusy={permissionBusy}
            permissionError={permissionError}
            loading={loading}
            onSelectedUserIdChange={setSelectedUserId}
            onPermissionToGrantChange={setPermissionToGrant}
            onPermissionReasonChange={setPermissionReason}
            onGrantPermission={handleGrantPermission}
            onRevokePermission={handleRevokePermission}
          />
          <UsersTable
            title="Staff accounts"
            users={filteredUsers}
            query={query}
            onQueryChange={setQuery}
            loading={loading}
            emptyLabel="No staff accounts."
            searchLabel="Search staff accounts"
          />
        </>
      )}
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  loading: boolean
}) {
  return (
    <div className={adminMetricTileClass}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]"><Icon size={17} /></span>
        <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
      </div>
      <p className="m-0 mt-3 text-[24px] font-black leading-none text-[#3f3f46] tabular-nums">{loading ? '-' : value}</p>
    </div>
  )
}

function CountList({ title, data }: { title: string; data: Array<{ key: string; value: number }> }) {
  return (
    <div className="rounded-[14px] border border-[#f4f4f5] bg-[#fbfbfc] p-3">
      <p className="m-0 mb-2 text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{title}</p>
      {!data.length ? (
        <p className="m-0 py-4 text-center text-[13px] font-semibold text-[#a1a1aa]">-</p>
      ) : (
        <div className="grid gap-1.5">
          {data.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-[10px] bg-white px-3 py-2">
              <span className="min-w-0 truncate text-[13px] font-black text-[#52525c]">{statusLabels[item.key] ?? item.key}</span>
              <span className="text-[13px] font-black text-[#111827] tabular-nums">{formatNumber(item.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccessRiskPanel({ signals }: { signals: ReturnType<typeof buildAccessSignals> }) {
  const riskItems = [
    {
      icon: Mail,
      label: 'Verify email',
      value: signals.unverified,
      detail: 'Students cannot reliably recover access.',
      action: 'Confirm email or resend onboarding.',
    },
    {
      icon: ShieldOff,
      label: 'Reactivate',
      value: signals.inactive,
      detail: 'Disabled student accounts.',
      action: 'Restore access or archive the account.',
    },
    {
      icon: UserCheck,
      label: 'First login',
      value: signals.neverLoggedIn,
      detail: 'Created accounts with no session yet.',
      action: 'Follow up before the sale goes cold.',
    },
    {
      icon: Banknote,
      label: 'Paid no access',
      value: signals.paidWithoutAccess,
      detail: 'Payment exists but no active entitlement.',
      action: 'Grant the missing access or refund.',
    },
    {
      icon: Crown,
      label: 'Plan mismatch',
      value: signals.planWithoutEntitlement,
      detail: 'Pro or VIP plan without entitlement rows.',
      action: 'Create the entitlement for the plan.',
    },
    {
      icon: KeyRound,
      label: 'Staff roles',
      value: signals.staffWithoutPermissions,
      detail: 'Verified staff account cannot act.',
      action: 'Grant the minimum required permission.',
    },
  ]

  return (
    <section className={`${card} mb-5 p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Access health</h2>
          <p className="m-0 mt-1 text-[12px] font-semibold text-[#a1a1aa]">Only accounts that need an operator decision.</p>
        </div>
        <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-black text-[#f5900b] tabular-nums">
          {formatNumber(signals.total)} to review
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {riskItems.map((item) => <RiskCard key={item.label} {...item} />)}
      </div>
    </section>
  )
}

function RiskCard({
  icon: Icon,
  label,
  value,
  detail,
  action,
}: {
  icon: LucideIcon
  label: string
  value: number
  detail: string
  action: string
}) {
  const hasSignal = value > 0
  return (
    <div className={`min-h-[132px] rounded-[14px] border px-4 py-3 transition-[background-color,border-color,box-shadow] duration-150 ease-out ${hasSignal ? 'border-[#fed7aa] bg-[#fff7ed] shadow-[0_10px_26px_rgba(245,144,11,0.08)]' : 'border-[#dcfce7] bg-[#f0fdf4]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`grid h-9 w-9 place-items-center rounded-[11px] ${hasSignal ? 'bg-white text-[#f5900b]' : 'bg-white/70 text-[#16a34a]'}`}>
            <Icon size={16} />
          </span>
          <p className="m-0 mt-3 text-[13px] font-black text-[#3f3f46]">{label}</p>
          <p className="m-0 mt-1 text-[12px] font-semibold leading-5 text-[#71717a]">{detail}</p>
        </div>
        <span className={`text-[24px] font-black leading-none tabular-nums ${hasSignal ? 'text-[#f5900b]' : 'text-[#16a34a]'}`}>{formatNumber(value)}</span>
      </div>
      <p className={`m-0 mt-3 rounded-[10px] px-3 py-2 text-[12px] font-black leading-5 ${hasSignal ? 'bg-white text-[#92400e]' : 'bg-white/70 text-[#166534]'}`}>
        {hasSignal ? action : 'Clear'}
      </p>
    </div>
  )
}

function StudentAccountsTable({
  users,
  studentOptions,
  query,
  loading,
  onQueryChange,
}: {
  users: AdminUserAccessRow[]
  studentOptions: AdminUserAccessRow[]
  query: string
  loading: boolean
  onQueryChange: (value: string) => void
}) {
  const verifiedCount = studentOptions.filter((student) => student.is_email_verified).length
  const paidCount = studentOptions.filter((student) => student.payment_count > 0 || student.paid_revenue_centimes > 0).length
  const reviewCount = studentOptions.filter((student) => buildStudentSignals(student).length > 0).length

  return (
    <>
      <section className={adminMetricStripClass}>
        <StatTile icon={Users} label="Students" value={formatNumber(studentOptions.length)} loading={loading} />
        <StatTile icon={BadgeCheck} label="Verified" value={formatNumber(verifiedCount)} loading={loading} />
        <StatTile icon={Banknote} label="Paid" value={formatNumber(paidCount)} loading={loading} />
        <StatTile icon={AlertTriangle} label="Needs review" value={formatNumber(reviewCount)} loading={loading} />
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Student directory</h2>
            <p className="m-0 mt-1 text-[12px] font-semibold text-[#a1a1aa] tabular-nums">
              {formatNumber(users.length)} shown / {formatNumber(studentOptions.length)} total
            </p>
          </div>
          <AdminSearchBox
            value={query}
            onChange={onQueryChange}
            placeholder="Search by name, email, plan"
            label="Search student accounts"
            className="lg:w-[360px]"
          />
        </div>

        {loading ? (
          <div className="grid gap-0">
            {[1, 2, 3, 4, 5].map((item) => <SkeletonRow key={item} />)}
          </div>
        ) : users.length ? (
          <AdminTable minWidthClass="min-w-[1120px]">
            <thead className={adminTableHeadClass}>
              <tr className={adminTableHeadRowClass}>
                <th className={adminTableHeadCellClass}>Student</th>
                <th className={adminTableHeadCellClass}>Plan</th>
                <th className={adminTableHeadCellClass}>Access</th>
                <th className={adminTableHeadCellClass}>Payments</th>
                <th className={adminTableHeadCellClass}>Last seen</th>
                <th className={`${adminTableHeadCellClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <StudentAccountRow key={user.user_id} user={user} />
              ))}
            </tbody>
          </AdminTable>
        ) : (
          <div className="grid min-h-[320px] place-items-center p-8 text-center">
            <div>
              <UserRound size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
              <p className="m-0 text-[15px] font-black text-[#3f3f46]">No student accounts found.</p>
              <p className="m-0 mt-1 text-[12px] font-semibold text-[#a1a1aa]">Clear search or add a new student.</p>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function StudentAccountRow({ user }: { user: AdminUserAccessRow }) {
  const signals = buildStudentSignals(user)
  const detailHref = `/admin/users/students/${user.user_id}`
  const contextQuery = studentContextQuery(user)

  return (
    <tr className={adminTableRowClass}>
      <td className={adminTableCellClass}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[13px] font-black text-[color:var(--primary)]">
            {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || <UserRound size={16} />}
          </span>
          <span className="min-w-0">
            <a href={detailHref} className="block truncate font-black text-[#3f3f46] transition-[color] duration-150 ease-out hover:text-[color:var(--primary)]">
              {user.full_name || user.email}
            </a>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">{user.email}</span>
          </span>
        </div>
      </td>
      <td className={adminTableCellClass}>
        <div className="flex flex-wrap gap-1.5">
          <Badge label={tierLabel(user)} tone={user.is_pro ? 'good' : 'default'} />
          {user.is_email_verified ? <Badge label="verified" tone="good" /> : <Badge label="unverified" tone="warn" />}
          {!user.is_active && <Badge label="inactive" tone="warn" />}
        </div>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46] tabular-nums">{formatNumber(user.active_entitlements)} active</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa] tabular-nums">
          {signals.length ? `${formatNumber(signals.length)} signal(s)` : `${formatNumber(user.total_entitlements)} total`}
        </p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46] tabular-nums">{formatMoneyCentimes(user.paid_revenue_centimes)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa] tabular-nums">{formatNumber(user.payment_count)} payment(s)</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{formatDate(user.last_login) || 'No login'}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">Created {formatDate(user.created_at) || '-'}</p>
      </td>
      <td className={`${adminTableCellClass} text-right`}>
        <div className="flex justify-end gap-2">
          <a href={detailHref} className={`${adminTableActionButtonClass} border-[color:var(--primary)] text-[color:var(--primary)] hover:bg-[color:var(--primary-soft)]`}>
            <Pencil size={13} aria-hidden="true" />
            Edit
          </a>
          <a href={`/admin/students?${contextQuery}`} className={`${adminTableActionButtonClass} border-[#e4e4e7] text-[#52525c] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]`}>
            <GraduationCap size={13} aria-hidden="true" />
            Progress
          </a>
        </div>
      </td>
    </tr>
  )
}

function StudentRecordWorkspace({
  mode,
  selectedStudent,
  studentDraft,
  loading,
  busy,
  error,
  saved,
  subjects,
  subjectsLoading,
  manualAccessGrants,
  manualAccessLoading,
  manualAccessBusy,
  manualAccessError,
  manualAccessDraft,
  onStudentDraftChange,
  onSaveStudent,
  onResetStudent,
  onQuickStudentPatch,
  onSendPasswordReset,
  onManualAccessDraftChange,
  onManualAccessSubmit,
}: {
  mode: StudentEditorMode
  selectedStudent: AdminUserAccessRow | null
  studentDraft: AdminStudentAccountUpdateInput | null
  loading: boolean
  busy: string
  error: string
  saved: string
  subjects: CourseSubject[]
  subjectsLoading: boolean
  manualAccessGrants: AdminManualAccessGrant[]
  manualAccessLoading: boolean
  manualAccessBusy: string
  manualAccessError: string
  manualAccessDraft: StudentAccessDraft
  onStudentDraftChange: <Key extends keyof AdminStudentAccountUpdateInput>(
    key: Key,
    value: AdminStudentAccountUpdateInput[Key],
  ) => void
  onSaveStudent: () => void
  onResetStudent: () => void
  onQuickStudentPatch: (
    updates: AdminStudentAccountUpdateInput,
    busyKey: string,
    successLabel: string,
  ) => void
  onSendPasswordReset: () => void
  onManualAccessDraftChange: <Key extends keyof StudentAccessDraft>(
    key: Key,
    value: StudentAccessDraft[Key],
  ) => void
  onManualAccessSubmit: () => void
}) {
  const activeStudent = mode === 'edit' ? selectedStudent : null
  const draftTier = studentDraft?.tier ?? 'basic'
  const quickActionsDisabled = !activeStudent || loading || Boolean(busy)
  const studentSignals = activeStudent ? buildStudentSignals(activeStudent) : []
  const [copiedTrace, setCopiedTrace] = useState(false)

  useEffect(() => {
    setCopiedTrace(false)
  }, [activeStudent?.user_id])

  async function handleCopyTrace() {
    if (!activeStudent) return
    setCopiedTrace(true)
    try {
      await navigator.clipboard?.writeText(`#${activeStudent.user_id} ${activeStudent.email}`)
    } catch {
      // Clipboard can be unavailable in tests or restricted browser contexts.
    }
  }

  if (loading && !studentDraft) {
    return (
      <section className={`${card} p-5`}>
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
        </div>
      </section>
    )
  }

  if (!studentDraft) {
    return (
      <section className={`${card} grid min-h-[360px] place-items-center p-8 text-center`}>
        <div>
          <UserRound size={34} className="mx-auto mb-3 text-[#d4d4d8]" />
          <p className="m-0 text-[16px] font-black text-[#3f3f46]">Student not found.</p>
          <a href="/admin/users/students" className={`${adminPrimaryButtonClass} mt-4`}>
            Back to students
          </a>
        </div>
      </section>
    )
  }

  return (
    <section className={`${card} mb-5 p-5`}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
            {mode === 'create' ? <Plus size={19} /> : <UserRound size={19} />}
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-balance text-[22px] font-black leading-tight text-[#18181b]">
              {mode === 'create' ? 'New student' : activeStudent?.full_name || 'Student account'}
            </h2>
            <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">
              {mode === 'create' ? 'Create a clean student record' : activeStudent?.email}
            </p>
          </div>
        </div>
        {mode === 'edit' && activeStudent && <Badge label={`#${activeStudent.user_id}`} tone="accent" />}
      </div>

      <div className="grid gap-5">
        {mode === 'edit' && activeStudent && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
            <StudentHealthStrip student={activeStudent} signals={studentSignals} />
            <StudentAccessActionsPanel
              student={activeStudent}
              draft={studentDraft}
              draftTier={draftTier}
              busy={busy}
              quickActionsDisabled={quickActionsDisabled}
              onQuickStudentPatch={onQuickStudentPatch}
              onSendPasswordReset={onSendPasswordReset}
            />
          </div>
        )}

        {mode === 'edit' && activeStudent && (
          <StudentStaffActionGrid
            student={activeStudent}
            copiedTrace={copiedTrace}
            onCopyTrace={handleCopyTrace}
          />
        )}

        {mode === 'edit' && activeStudent && (
          <StudentOperatorChecklist student={activeStudent} signals={studentSignals} />
        )}

        <StudentAccountForm
          mode={mode}
          student={activeStudent}
          draft={studentDraft}
          busy={busy}
          error={error}
          saved={saved}
          onDraftChange={onStudentDraftChange}
          onSave={onSaveStudent}
          onReset={onResetStudent}
        />

        {mode === 'edit' && activeStudent && (
          <StudentAccessPanel
            student={activeStudent}
            subjects={subjects}
            subjectsLoading={subjectsLoading}
            grants={manualAccessGrants}
            grantsLoading={manualAccessLoading}
            draft={manualAccessDraft}
            busy={manualAccessBusy}
            error={manualAccessError}
            onDraftChange={onManualAccessDraftChange}
            onSubmit={onManualAccessSubmit}
          />
        )}

        <StudentMetaGrid student={activeStudent} draft={studentDraft} mode={mode} />
      </div>
    </section>
  )
}

function StudentAccountForm({
  mode,
  student,
  draft,
  busy,
  error,
  saved,
  onDraftChange,
  onSave,
  onReset,
}: {
  mode: StudentEditorMode
  student: AdminUserAccessRow | null
  draft: AdminStudentAccountUpdateInput
  busy: string
  error: string
  saved: string
  onDraftChange: <Key extends keyof AdminStudentAccountUpdateInput>(
    key: Key,
    value: AdminStudentAccountUpdateInput[Key],
  ) => void
  onSave: () => void
  onReset: () => void
}) {
  return (
    <section id="student-account-details" className="scroll-mt-6 rounded-[18px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-black text-[#3f3f46]">Account details</h3>
          {student && <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{student.email}</p>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Name</span>
          <input
            value={draft.full_name ?? ''}
            onChange={(event) => onDraftChange('full_name', event.target.value)}
            disabled={busy === 'save'}
            aria-label="Student full name"
            className={controlClass}
          />
        </label>
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Email</span>
          <input
            type="email"
            value={draft.email ?? ''}
            onChange={(event) => onDraftChange('email', event.target.value)}
            disabled={busy === 'save'}
            aria-label="Student email"
            className={controlClass}
          />
        </label>
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Level</span>
          <input
            value={draft.niveau ?? ''}
            onChange={(event) => onDraftChange('niveau', event.target.value)}
            disabled={busy === 'save'}
            aria-label="Student level"
            className={controlClass}
          />
        </label>
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Track</span>
          <input
            value={draft.filiere ?? ''}
            onChange={(event) => onDraftChange('filiere', event.target.value)}
            disabled={busy === 'save'}
            aria-label="Student track"
            className={controlClass}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Plan</span>
          <select
            value={draft.tier ?? 'basic'}
            onChange={(event) => onDraftChange('tier', event.target.value as AdminStudentAccountUpdateInput['tier'])}
            disabled={busy === 'save'}
            aria-label="Student plan"
            className={controlClass}
          >
            {studentTierOptions.map((tier) => (
              <option key={tier} value={tier}>{statusLabels[tier]}</option>
            ))}
          </select>
        </label>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <StatusToggle
            icon={draft.is_active ? CheckCircle2 : CircleOff}
            label="Active"
            checked={Boolean(draft.is_active)}
            disabled={busy === 'save'}
            onChange={(checked) => onDraftChange('is_active', checked)}
          />
          <StatusToggle
            icon={draft.is_email_verified ? BadgeCheck : Mail}
            label="Verified"
            checked={Boolean(draft.is_email_verified)}
            disabled={busy === 'save'}
            onChange={(checked) => onDraftChange('is_email_verified', checked)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy === 'save'}
          className={adminPrimaryButtonClass}
        >
          {busy === 'save' ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <Save size={15} />}
          {mode === 'create' ? 'Create student' : 'Save account'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={busy === 'save'}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-4 text-[13px] font-black text-[#52525c] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          <RotateCcw size={15} />
          {mode === 'create' ? 'Clear' : 'Reset'}
        </button>
        {saved && <span className="rounded-full bg-[#f0fdf4] px-3 py-1 text-[12px] font-black text-[#16a34a]">{saved}</span>}
        {error && <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-black text-[#b45309]">{error}</span>}
      </div>
    </section>
  )
}

function StudentStaffActionGrid({
  student,
  copiedTrace,
  onCopyTrace,
}: {
  student: AdminUserAccessRow
  copiedTrace: boolean
  onCopyTrace: () => void
}) {
  const contextQuery = studentContextQuery(student)

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Student staff actions">
      <StudentStaffActionLink
        icon={UserRound}
        label="Account"
        value="Profile, plan, status"
        href="#student-account-details"
      />
      <StudentStaffActionLink
        icon={ShieldCheck}
        label="Subject access"
        value={`${formatNumber(student.active_entitlements)} active / ${formatNumber(student.total_entitlements)} total`}
        href="#student-subject-access"
      />
      <StudentStaffActionLink
        icon={Banknote}
        label="Payments"
        value={student.payment_count ? `${formatMoneyCentimes(student.paid_revenue_centimes)} / ${formatNumber(student.payment_count)}` : 'No payment'}
        href={`/admin/finance?${contextQuery}`}
      />
      <StudentStaffActionLink
        icon={GraduationCap}
        label="Progress"
        value={`${formatNumber(student.active_entitlements)} active access`}
        href={`/admin/students?${contextQuery}`}
      />
      <StudentStaffActionLink
        icon={Mail}
        label="Messages"
        value={student.full_name || student.email}
        href={`/admin/communications?${contextQuery}`}
      />
      <button
        type="button"
        onClick={onCopyTrace}
        className="group flex min-h-[72px] items-center gap-3 rounded-[16px] bg-white px-3 py-3 text-left shadow-[var(--shadow-border)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#fbfbfc] active:scale-[0.96]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)] transition-[background-color,color] duration-150 ease-out group-hover:bg-[color:var(--primary)] group-hover:text-white">
          <KeyRound size={16} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">
            {copiedTrace ? 'Copied trace' : 'Copy trace'}
          </span>
          <span className="mt-0.5 block truncate text-[14px] font-black text-[#3f3f46] tabular-nums">
            #{student.user_id}
          </span>
        </span>
      </button>
    </section>
  )
}

function studentContextQuery(student: AdminUserAccessRow) {
  const params = new URLSearchParams()
  params.set('student_id', String(student.user_id))
  params.set('q', student.email || student.full_name || String(student.user_id))
  return params.toString()
}

function StudentStaffActionLink({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  href: string
}) {
  return (
    <a
      href={href}
      className="group flex min-h-[72px] items-center gap-3 rounded-[16px] bg-white px-3 py-3 text-left shadow-[var(--shadow-border)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#fbfbfc] active:scale-[0.96]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)] transition-[background-color,color] duration-150 ease-out group-hover:bg-[color:var(--primary)] group-hover:text-white">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
        <span className="mt-0.5 block truncate text-[14px] font-black text-[#3f3f46] tabular-nums">{value}</span>
      </span>
    </a>
  )
}

function StudentOperatorChecklist({
  student,
  signals,
}: {
  student: AdminUserAccessRow
  signals: string[]
}) {
  const actions = buildStudentOperatorActions(student, signals)

  return (
    <section className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]" aria-label="Student staff checklist">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h4 className="m-0 text-[15px] font-black text-[#3f3f46]">Staff checklist</h4>
        <Badge label={signals.length ? `${formatNumber(signals.length)} to fix` : 'ready'} tone={signals.length ? 'warn' : 'good'} />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ icon: Icon, ...action }) => (
          <a
            key={action.label}
            href={action.href}
            className="group flex min-h-[88px] items-start gap-3 rounded-[14px] bg-white px-3 py-3 shadow-[var(--shadow-border)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#fbfbfc] active:scale-[0.96]"
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] transition-[background-color,color] duration-150 ease-out ${
              action.tone === 'warn'
                ? 'bg-[#fff7ed] text-[#f5900b] group-hover:bg-[#f5900b] group-hover:text-white'
                : action.tone === 'good'
                  ? 'bg-[#f0fdf4] text-[#16a34a] group-hover:bg-[#16a34a] group-hover:text-white'
                  : 'bg-[color:var(--primary-soft)] text-[color:var(--primary)] group-hover:bg-[color:var(--primary)] group-hover:text-white'
            }`}>
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-[#3f3f46]">{action.label}</span>
              <span className="mt-1 block text-pretty text-[12px] font-semibold leading-5 text-[#71717a]">{action.value}</span>
            </span>
            <ChevronRight size={14} aria-hidden="true" className="mt-3 shrink-0 text-[#c0c0c7] transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-[color:var(--primary)] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
          </a>
        ))}
      </div>
    </section>
  )
}

function StudentHealthStrip({ student, signals }: { student: AdminUserAccessRow; signals: string[] }) {
  return (
    <div className="grid gap-3 rounded-[18px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)] sm:grid-cols-2 xl:grid-cols-4">
      <StudentFact icon={ShieldCheck} label="Access" value={`${tierLabel(student)} - ${student.is_active ? 'Active' : 'Inactive'}`} />
      <StudentFact icon={BadgeCheck} label="Identity" value={student.is_email_verified ? 'Verified' : 'Unverified'} />
      <StudentFact icon={Banknote} label="Paid" value={formatMoneyCentimes(student.paid_revenue_centimes)} />
      <StudentFact icon={AlertTriangle} label="Signals" value={signals.length ? `${formatNumber(signals.length)} to review` : 'Clear'} />
    </div>
  )
}

function StudentMetaGrid({
  student,
  draft,
  mode,
}: {
  student: AdminUserAccessRow | null
  draft: AdminStudentAccountUpdateInput
  mode: StudentEditorMode
}) {
  const placement = student
    ? `${student.niveau || '-'} / ${student.filiere || '-'}`
    : `${draft.niveau || '-'} / ${draft.filiere || '-'}`
  const access = student
    ? `${tierLabel(student)} / ${student.is_active ? 'active' : 'inactive'}`
    : `${statusLabels[draft.tier ?? 'basic']} / ${draft.is_active ? 'active' : 'inactive'}`

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {student && <StudentFact icon={UserRound} label="Student ID" value={`#${student.user_id}`} />}
      <StudentFact icon={GraduationCap} label="Placement" value={placement} />
      <StudentFact icon={ShieldCheck} label="Access" value={access} />
      <StudentFact icon={BadgeCheck} label="Entitlements" value={student ? `${formatNumber(student.active_entitlements)} active / ${formatNumber(student.total_entitlements)} total` : '0 active / 0 total'} />
      {student && <StudentFact icon={Brain} label="AI month" value={`${formatNumber(student.ai_quota_used_month ?? 0)} units`} />}
      {student && <StudentFact icon={Banknote} label="Revenue" value={formatMoneyCentimes(student.paid_revenue_centimes)} />}
      {student && <StudentFact icon={Banknote} label="Payments" value={`${formatNumber(student.payment_count)} paid`} />}
      {student && <StudentFact icon={BadgeCheck} label="Last payment" value={formatDate(student.latest_payment_at) || '-'} />}
      <StudentFact icon={UserCheck} label={mode === 'create' ? 'Login' : 'Last seen'} value={student ? formatDate(student.last_login) || 'No login' : 'Not created'} />
    </section>
  )
}

function StudentAccessPanel({
  student,
  subjects,
  subjectsLoading,
  grants,
  grantsLoading,
  draft,
  busy,
  error,
  onDraftChange,
  onSubmit,
}: {
  student: AdminUserAccessRow
  subjects: CourseSubject[]
  subjectsLoading: boolean
  grants: AdminManualAccessGrant[]
  grantsLoading: boolean
  draft: StudentAccessDraft
  busy: string
  error: string
  onDraftChange: <Key extends keyof StudentAccessDraft>(key: Key, value: StudentAccessDraft[Key]) => void
  onSubmit: () => void
}) {
  const submitLabel = draft.action === 'grant' ? 'Grant access' : 'Revoke access'
  const submitDisabled = subjectsLoading || !subjects.length || Boolean(busy)

  return (
    <section id="student-subject-access" className="scroll-mt-6 rounded-[18px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="m-0 text-[15px] font-black text-[#3f3f46]">Subject access</h4>
          <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{student.email}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#71717a] shadow-[var(--shadow-border)] tabular-nums">
          {formatNumber(student.active_entitlements)} / {formatNumber(student.total_entitlements)}
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(180px,1fr)_160px_120px_minmax(0,1.1fr)_auto]">
        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Subject</span>
          <select
            value={draft.subject_id}
            onChange={(event) => onDraftChange('subject_id', event.target.value)}
            disabled={subjectsLoading || !subjects.length || Boolean(busy)}
            aria-label="Student access subject"
            className={controlClass}
          >
            {!subjects.length && <option value="">No subjects</option>}
            {subjects.map((subject) => (
              <option key={subject.id} value={String(subject.id)}>{subject.title}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-1.5">
          <span className={labelClass}>Action</span>
          <div className="grid h-11 grid-cols-2 rounded-[12px] bg-white p-1 shadow-[var(--shadow-border)]">
            {(['grant', 'revoke'] as const).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onDraftChange('action', action)}
                disabled={Boolean(busy)}
                aria-pressed={draft.action === action}
                className={`rounded-[10px] text-[12px] font-black transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${
                  draft.action === action
                    ? action === 'grant'
                      ? 'bg-[#ecfdf5] text-[#047857] shadow-[var(--shadow-border)]'
                      : 'bg-[#fff7ed] text-[#c2410c] shadow-[var(--shadow-border)]'
                    : 'text-[#71717a] hover:text-[#3f3f46]'
                }`}
              >
                {action === 'grant' ? 'Grant' : 'Revoke'}
              </button>
            ))}
          </div>
        </div>

        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Days</span>
          <input
            type="number"
            min={1}
            max={730}
            value={draft.duration_days}
            onChange={(event) => onDraftChange('duration_days', Number(event.target.value))}
            disabled={draft.action === 'revoke' || Boolean(busy)}
            aria-label="Student access duration days"
            className={controlClass}
          />
        </label>

        <label className="grid min-w-0 gap-1.5">
          <span className={labelClass}>Reason</span>
          <input
            value={draft.reason}
            onChange={(event) => onDraftChange('reason', event.target.value)}
            disabled={Boolean(busy)}
            aria-label="Student access reason"
            className={controlClass}
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] px-4 text-[13px] font-black text-white transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 xl:w-auto ${
              draft.action === 'grant' ? 'bg-[#16a34a]' : 'bg-[#f97316]'
            }`}
          >
            {busy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : draft.action === 'grant' ? <Plus size={15} /> : <XCircle size={15} />}
            {submitLabel}
          </button>
        </div>
      </div>

      {error && <p className="m-0 mt-3 text-[12px] font-black text-[#b45309]">{error}</p>}

      <div className="mt-4 max-h-[178px] overflow-y-auto rounded-[14px] bg-white shadow-[var(--shadow-border)]">
        {grantsLoading ? (
          <div className="grid gap-2 p-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-11 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />
            ))}
          </div>
        ) : grants.length ? (
          <div className="divide-y divide-[#f4f4f5]">
            {grants.map((grant) => (
              <div key={grant.id} className="grid gap-2 px-3 py-3 text-[12px] sm:grid-cols-[110px_minmax(0,1fr)_96px] sm:items-center">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge label={grant.action === 'grant' ? 'Grant' : 'Revoke'} tone={grant.action === 'grant' ? 'good' : 'warn'} />
                  <span className="truncate font-black text-[#3f3f46]">{grant.status}</span>
                </span>
                <span className="min-w-0 truncate font-bold text-[#71717a]">
                  {subjectLabel(subjects, grant.subject_id)} - {grant.reason}
                </span>
                <span className="text-right font-bold text-[#a1a1aa] tabular-nums">{formatDate(grant.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 px-3 py-4 text-center text-[13px] font-bold text-[#a1a1aa]">No access changes.</p>
        )}
      </div>
    </section>
  )
}

function StudentFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-[14px] bg-[#fbfbfc] px-3 py-2 shadow-[var(--shadow-border)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white text-[color:var(--primary)] shadow-[var(--shadow-border)]">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">{label}</span>
        <span className="mt-0.5 block truncate text-[13px] font-black text-[#3f3f46] tabular-nums">{value}</span>
      </span>
    </div>
  )
}

function StudentAccessActionsPanel({
  student,
  draft,
  draftTier,
  busy,
  quickActionsDisabled,
  onQuickStudentPatch,
  onSendPasswordReset,
}: {
  student: AdminUserAccessRow
  draft: AdminStudentAccountUpdateInput
  draftTier: AdminStudentAccountUpdateInput['tier']
  busy: string
  quickActionsDisabled: boolean
  onQuickStudentPatch: (
    updates: AdminStudentAccountUpdateInput,
    busyKey: string,
    successLabel: string,
  ) => void
  onSendPasswordReset: () => void
}) {
  return (
    <section className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[var(--shadow-border)]" aria-label="Student account operations">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="m-0 text-[15px] font-black text-[#3f3f46]">Access actions</h4>
          <p className="m-0 mt-1 truncate text-[12px] font-semibold text-[#a1a1aa]">{student.email}</p>
        </div>
        {busy && <Loader2 size={16} className="shrink-0 animate-spin motion-reduce:animate-none text-[color:var(--primary)]" />}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {studentTierOptions.map((tier) => (
          <PlanActionButton
            key={tier}
            label={statusLabels[tier]}
            active={draftTier === tier}
            disabled={quickActionsDisabled || draftTier === tier}
            busy={busy === `tier-${tier}`}
            onClick={() => onQuickStudentPatch({ tier }, `tier-${tier}`, `${statusLabels[tier]} set`)}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-2">
        <QuickActionButton
          icon={draft.is_email_verified ? ShieldOff : UserCheck}
          label={draft.is_email_verified ? 'Unverify email' : 'Verify email'}
          tone={draft.is_email_verified ? 'default' : 'good'}
          disabled={quickActionsDisabled}
          busy={busy === 'verify'}
          onClick={() => onQuickStudentPatch(
            { is_email_verified: !draft.is_email_verified },
            'verify',
            draft.is_email_verified ? 'Email unverified' : 'Email verified',
          )}
        />
        <QuickActionButton
          icon={draft.is_active ? UserX : UserCheck}
          label={draft.is_active ? 'Suspend account' : 'Restore account'}
          tone={draft.is_active ? 'warn' : 'good'}
          disabled={quickActionsDisabled}
          busy={busy === 'active'}
          onClick={() => onQuickStudentPatch(
            { is_active: !draft.is_active },
            'active',
            draft.is_active ? 'Account suspended' : 'Account restored',
          )}
        />
        <QuickActionButton
          icon={KeyRound}
          label="Send reset email"
          tone="default"
          disabled={quickActionsDisabled || !student.email}
          busy={busy === 'password-reset'}
          onClick={onSendPasswordReset}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StudentInlineAction href="#student-account-details" icon={Pencil} label="Edit details" />
        <StudentInlineAction href="#student-subject-access" icon={ShieldCheck} label="Grant or revoke" />
      </div>
    </section>
  )
}

function StudentInlineAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: LucideIcon
  label: string
}) {
  return (
    <a
      href={href}
      className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-[12px] border border-[#e4e4e7] bg-white px-3 text-[12px] font-black text-[#52525c] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] active:scale-[0.96]"
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}

function PlanActionButton({
  label,
  active,
  disabled,
  busy,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`Set ${label} plan`}
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[12px] border px-2 text-[12px] font-black transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:active:scale-100 ${
        active
          ? 'border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)] shadow-[var(--shadow-border)]'
          : 'border-[#e4e4e7] bg-white text-[#52525c] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:opacity-50'
      }`}
    >
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : <Crown size={13} />}
      <span className="truncate">{label}</span>
    </button>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  tone,
  disabled,
  busy,
  onClick,
}: {
  icon: LucideIcon
  label: string
  tone: 'default' | 'good' | 'warn'
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  const toneClass = tone === 'good'
    ? 'border-[#bbf7d0] bg-[#ecfdf5] text-[#047857] hover:bg-[#d1fae5]'
    : tone === 'warn'
      ? 'border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] hover:bg-[#ffedd5]'
      : 'border-[#e4e4e7] bg-white text-[#52525c] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 min-w-0 items-center justify-between gap-3 rounded-[12px] border px-3 text-[13px] font-black transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${toneClass}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {busy ? <Loader2 size={15} className="shrink-0 animate-spin motion-reduce:animate-none" /> : <Icon size={15} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
    </button>
  )
}

function StatusToggle({
  icon: Icon,
  label,
  checked,
  disabled,
  onChange,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={`flex h-11 items-center justify-between gap-3 rounded-[12px] border-[2px] px-3 text-left transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${
        checked
          ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
          : 'border-[#e4e4e7] bg-white text-[#71717a]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0" />
        <span className="truncate text-[13px] font-black">{label}</span>
      </span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition-[background-color] duration-150 ease-out motion-reduce:transition-none ${checked ? 'bg-[#22c55e]' : 'bg-[#d4d4d8]'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-[transform] duration-150 ease-out motion-reduce:transition-none ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function PermissionsPanel({
  selectedUser,
  selectedUserId,
  permissionTargets,
  permissionToGrant,
  permissionReason,
  permissionBusy,
  permissionError,
  loading,
  onSelectedUserIdChange,
  onPermissionToGrantChange,
  onPermissionReasonChange,
  onGrantPermission,
  onRevokePermission,
}: {
  selectedUser: AdminUserAccessRow | null
  selectedUserId: string
  permissionTargets: AdminUserAccessRow[]
  permissionToGrant: string
  permissionReason: string
  permissionBusy: string
  permissionError: string
  loading: boolean
  onSelectedUserIdChange: (value: string) => void
  onPermissionToGrantChange: (value: string) => void
  onPermissionReasonChange: (value: string) => void
  onGrantPermission: () => void
  onRevokePermission: (permission: AdminUserPermission) => void
}) {
  return (
    <section className={`${card} mb-5 p-5`}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[color:var(--primary)]">
            <KeyRound size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">Permissions</h2>
          </div>
        </div>
        <span className="w-fit rounded-full bg-[#f4f4f5] px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#71717a] tabular-nums">
          {formatNumber(permissionTargets.length)} eligible staff
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a1a1aa]">Staff user</span>
            <select
              value={selectedUserId}
              onChange={(event) => onSelectedUserIdChange(event.target.value)}
              disabled={!permissionTargets.length || loading}
              aria-label="Select staff user"
              className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[background-color,border-color,color] duration-150 ease-out focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
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
                onChange={(event) => onPermissionToGrantChange(event.target.value)}
                disabled={!selectedUser || loading}
                aria-label="Select permission"
                className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[background-color,border-color,color] duration-150 ease-out focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
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
                onChange={(event) => onPermissionReasonChange(event.target.value)}
                disabled={!selectedUser || loading}
                aria-label="Permission audit reason"
                className="h-11 rounded-[12px] border-[2px] border-[#e4e4e7] bg-white px-3 text-[13px] font-bold text-[#3f3f46] outline-none transition-[background-color,border-color,color] duration-150 ease-out placeholder:text-[#c0c0c7] focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onGrantPermission}
              disabled={!selectedUser || permissionBusy === 'grant' || loading}
              className={adminPrimaryButtonClass}
            >
              {permissionBusy === 'grant' ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <Plus size={15} />}
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
                        onClick={() => onRevokePermission(permission)}
                        disabled={permissionBusy === `revoke-${permission.id}`}
                        className="inline-flex h-10 w-fit items-center gap-1.5 rounded-[10px] border border-[#fee2e2] bg-[#fff7f7] px-3 text-[12px] font-black text-[#dc2626] transition-[background-color,border-color,opacity,transform] duration-150 ease-out hover:border-[#fecaca] hover:bg-[#fee2e2] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                      >
                        {permissionBusy === `revoke-${permission.id}` ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : <XCircle size={13} />}
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[116px] place-items-center rounded-[12px] border border-dashed border-[#e4e4e7] bg-white px-4 text-center">
                  <p className="m-0 text-[13px] font-bold text-[#a1a1aa]">No active permissions.</p>
                </div>
              )}
            </>
          ) : (
            <div className="grid min-h-[160px] place-items-center text-center">
              <p className="m-0 text-[13px] font-bold text-[#a1a1aa]">No eligible staff user.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function UsersTable({
  title,
  users,
  query,
  onQueryChange,
  loading,
  emptyLabel,
  searchLabel,
  selectedUserId = null,
  actionLabel,
  onSelectUser,
}: {
  title: string
  users: AdminUserAccessRow[]
  query: string
  onQueryChange: (value: string) => void
  loading: boolean
  emptyLabel: string
  searchLabel: string
  selectedUserId?: number | null
  actionLabel?: string
  onSelectUser?: (user: AdminUserAccessRow) => void
}) {
  const hasActions = Boolean(actionLabel && onSelectUser)
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-[#f4f4f5] p-5 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="m-0 text-[16px] font-black text-[#3f3f46]">{title}</h2>
        <AdminSearchBox value={query} onChange={onQueryChange} placeholder="Search accounts" label={searchLabel} className="lg:w-[340px]" />
      </div>

      {loading ? (
        <div className="grid gap-0">
          {[1, 2, 3, 4].map((item) => <SkeletonRow key={item} />)}
        </div>
      ) : users.length ? (
        <AdminTable minWidthClass="min-w-[1080px]">
          <thead className={adminTableHeadClass}>
            <tr className={adminTableHeadRowClass}>
              <th className={adminTableHeadCellClass}>Account</th>
              <th className={adminTableHeadCellClass}>Role</th>
              <th className={adminTableHeadCellClass}>Access</th>
              <th className={adminTableHeadCellClass}>Entitlements</th>
              <th className={adminTableHeadCellClass}>Payments</th>
              <th className={adminTableHeadCellClass}>Last seen</th>
              {hasActions && <th className={`${adminTableHeadCellClass} text-right`}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                key={user.user_id}
                user={user}
                selected={selectedUserId === user.user_id}
                actionLabel={actionLabel}
                onSelectUser={onSelectUser}
              />
            ))}
          </tbody>
        </AdminTable>
      ) : (
        <div className="grid min-h-[260px] place-items-center p-8 text-center">
          <div>
            <UserRound size={30} className="mx-auto mb-3 text-[#d4d4d8]" />
            <p className="m-0 text-[15px] font-black text-[#3f3f46]">{emptyLabel}</p>
          </div>
        </div>
      )}
    </section>
  )
}

function UserRow({
  user,
  selected = false,
  actionLabel,
  onSelectUser,
}: {
  user: AdminUserAccessRow
  selected?: boolean
  actionLabel?: string
  onSelectUser?: (user: AdminUserAccessRow) => void
}) {
  return (
    <tr className={`${adminTableRowClass} ${selected ? 'bg-[color:var(--primary-soft)] hover:bg-[color:var(--primary-soft)]' : ''}`}>
      <td className={adminTableCellClass}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[color:var(--primary-soft)] text-[13px] font-black text-[color:var(--primary)]">
            {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || <UserRound size={16} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black text-[#3f3f46]">{user.full_name || user.email}</span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#a1a1aa]">{user.email}</span>
          </span>
        </div>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{statusLabels[user.role] ?? user.role}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">{user.niveau || 'Niveau -'} / {user.filiere || 'Filiere -'}</p>
      </td>
      <td className={adminTableCellClass}>
        <div className="flex flex-wrap gap-1.5">
          <Badge label={tierLabel(user)} tone={user.is_pro ? 'good' : 'default'} />
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
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46] tabular-nums">{formatNumber(user.active_entitlements)} active</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa] tabular-nums">{formatNumber(user.total_entitlements)} total / {formatNumber(user.active_permissions)} perms</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46] tabular-nums">{formatMoneyCentimes(user.paid_revenue_centimes)}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa] tabular-nums">{formatNumber(user.payment_count)} payment(s)</p>
      </td>
      <td className={adminTableCellClass}>
        <p className="m-0 font-black text-[#3f3f46]">{formatDate(user.last_login) || 'No login'}</p>
        <p className="m-0 mt-0.5 text-[12px] font-semibold text-[#a1a1aa]">Created {formatDate(user.created_at) || '-'}</p>
      </td>
      {actionLabel && onSelectUser && (
        <td className={`${adminTableCellClass} text-right`}>
          <AdminTableActionButton
            type="button"
            onClick={() => onSelectUser(user)}
            aria-pressed={selected}
            className={selected ? 'bg-white' : ''}
          >
            <Pencil size={13} />
            {selected ? 'Editing' : actionLabel}
          </AdminTableActionButton>
        </td>
      )}
    </tr>
  )
}

function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'good' | 'warn' | 'accent' }) {
  const toneClass = tone === 'good'
    ? 'bg-[#f0fdf4] text-[#16a34a]'
    : tone === 'warn'
      ? 'bg-[#fff7ed] text-[#f5900b]'
      : tone === 'accent'
        ? 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]'
        : 'bg-[#f4f4f5] text-[#71717a]'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-black ${toneClass}`}>{label}</span>
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-t border-[#f4f4f5] px-5 py-4 first:border-t-0">
      <div className="h-10 w-10 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-[12px] bg-[#f4f4f5]" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-56 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
        <div className="mt-2 h-3 w-72 max-w-full motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5]" />
      </div>
      <div className="hidden h-4 w-24 motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none rounded-full bg-[#f4f4f5] sm:block" />
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('fr-FR')
}

function subjectLabel(subjects: CourseSubject[], subjectId: number) {
  return subjects.find((subject) => subject.id === subjectId)?.title ?? `Subject #${subjectId}`
}

function studentDraftFromUser(user: AdminUserAccessRow): AdminStudentAccountUpdateInput {
  return {
    full_name: user.full_name || '',
    email: user.email || '',
    niveau: user.niveau || '',
    filiere: user.filiere || '',
    tier: studentTierForForm(user),
    is_active: user.is_active,
    is_email_verified: user.is_email_verified,
  }
}

function normalizeStudentDraft(draft: AdminStudentAccountUpdateInput): AdminStudentAccountUpdateInput {
  return {
    full_name: draft.full_name?.trim() ?? '',
    email: draft.email?.trim().toLowerCase() ?? '',
    niveau: draft.niveau?.trim() ?? '',
    filiere: draft.filiere?.trim() ?? '',
    tier: draft.tier ?? 'basic',
    is_active: Boolean(draft.is_active),
    is_email_verified: Boolean(draft.is_email_verified),
  }
}

function normalizeStudentCreateDraft(draft: AdminStudentAccountUpdateInput): AdminStudentAccountCreateInput {
  return {
    full_name: draft.full_name?.trim() ?? '',
    email: draft.email?.trim().toLowerCase() ?? '',
    niveau: draft.niveau?.trim() ?? '',
    filiere: draft.filiere?.trim() ?? '',
    tier: draft.tier ?? 'basic',
    is_active: Boolean(draft.is_active),
    is_email_verified: Boolean(draft.is_email_verified),
  }
}

function validateStudentDraft(draft: AdminStudentAccountUpdateInput) {
  const email = (draft.email ?? '').trim()
  if ((draft.full_name ?? '').trim().length < 2) return 'Student name is required.'
  if (!email) return 'Student email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Student email is invalid.'
  return ''
}

function studentTierForForm(user: AdminUserAccessRow): AdminStudentAccountUpdateInput['tier'] {
  const tier = user.tier?.toLowerCase()
  if (tier === 'basic' || tier === 'pro' || tier === 'vip') return tier
  return user.is_pro ? 'vip' : 'basic'
}

function tierLabel(user: AdminUserAccessRow) {
  const tier = studentTierForForm(user) ?? 'basic'
  return statusLabels[tier] ?? 'Basic'
}

function buildStudentOperatorActions(student: AdminUserAccessRow, signals: string[]): StudentOperatorAction[] {
  const contextQuery = studentContextQuery(student)
  const actions: StudentOperatorAction[] = []
  const addAction = (action: StudentOperatorAction) => {
    if (!actions.some((item) => item.label === action.label)) actions.push(action)
  }

  if (signals.includes('paid no access')) {
    addAction({
      icon: Banknote,
      label: 'Grant paid access',
      value: 'Payment exists, but the student has no active subject access.',
      href: '#student-subject-access',
      tone: 'warn',
    })
  }

  if (!student.is_active) {
    addAction({
      icon: UserCheck,
      label: 'Activate account',
      value: 'Restore login access or keep the account disabled intentionally.',
      href: '#student-account-details',
      tone: 'warn',
    })
  }

  if (!student.is_email_verified) {
    addAction({
      icon: BadgeCheck,
      label: 'Verify email',
      value: 'Confirm identity so recovery and account notices work.',
      href: '#student-account-details',
      tone: 'warn',
    })
  }

  if (!student.last_login) {
    addAction({
      icon: Mail,
      label: 'First login follow-up',
      value: 'No session yet. Check the private chat or contact trail.',
      href: `/admin/communications?${contextQuery}`,
      tone: 'warn',
    })
  }

  if (signals.includes('plan no entitlement')) {
    addAction({
      icon: Crown,
      label: 'Align plan access',
      value: `${tierLabel(student)} plan needs matching subject entitlement.`,
      href: '#student-subject-access',
      tone: 'warn',
    })
  }

  addAction({
    icon: UserRound,
    label: 'Edit details',
    value: 'Name, email, level, track, plan, and account status.',
    href: '#student-account-details',
    tone: 'accent',
  })
  addAction({
    icon: Banknote,
    label: 'Review payments',
    value: `${formatMoneyCentimes(student.paid_revenue_centimes)} across ${formatNumber(student.payment_count)} payment(s).`,
    href: `/admin/finance?${contextQuery}`,
    tone: student.payment_count ? 'good' : 'accent',
  })
  addAction({
    icon: GraduationCap,
    label: 'Review progress',
    value: `${formatNumber(student.active_entitlements)} active access item(s).`,
    href: `/admin/students?${contextQuery}`,
    tone: 'accent',
  })
  addAction({
    icon: Mail,
    label: 'Private messages',
    value: student.full_name || student.email || `Student #${student.user_id}`,
    href: `/admin/communications?${contextQuery}`,
    tone: 'accent',
  })

  return actions.slice(0, 4)
}

function matchesUser(user: AdminUserAccessRow, query: string) {
  if (!query) return true
  return [
    user.full_name,
    user.email,
    user.role,
    tierLabel(user),
    user.niveau,
    user.filiere,
    user.is_staff ? 'staff' : '',
    user.is_pro ? 'pro' : '',
    ...(user.active_permission_names ?? []),
  ].join(' ').toLowerCase().includes(query)
}

function isStudentAccount(user: AdminUserAccessRow) {
  return !user.is_staff && user.role === 'student'
}

function buildStudentSignals(user: AdminUserAccessRow) {
  const signals: string[] = []
  if (!user.is_active) signals.push('inactive')
  if (!user.is_email_verified) signals.push('unverified')
  if (!user.last_login) signals.push('no login')
  if ((user.payment_count > 0 || user.paid_revenue_centimes > 0) && user.active_entitlements === 0) {
    signals.push('paid no access')
  }
  if ((studentTierForForm(user) === 'pro' || studentTierForForm(user) === 'vip') && user.total_entitlements === 0) {
    signals.push('plan no entitlement')
  }
  return signals
}

function isPermissionTarget(user: AdminUserAccessRow) {
  return user.is_staff && user.is_active && user.is_email_verified
}

function buildAccessSignals(students: AdminUserAccessRow[], staff: AdminUserAccessRow[]) {
  let unverified = 0
  let inactive = 0
  let neverLoggedIn = 0
  let paidWithoutAccess = 0
  let planWithoutEntitlement = 0
  let staffWithoutPermissions = 0

  for (const user of students) {
    if (!user.is_email_verified) unverified += 1
    if (!user.is_active) inactive += 1
    if (!user.last_login) neverLoggedIn += 1
    if ((user.payment_count > 0 || user.paid_revenue_centimes > 0) && user.active_entitlements === 0) {
      paidWithoutAccess += 1
    }
    if ((studentTierForForm(user) === 'pro' || studentTierForForm(user) === 'vip') && user.total_entitlements === 0) {
      planWithoutEntitlement += 1
    }
  }
  for (const user of staff) {
    if (user.is_active && user.is_email_verified && user.active_permissions === 0) {
      staffWithoutPermissions += 1
    }
  }

  return {
    unverified,
    inactive,
    neverLoggedIn,
    paidWithoutAccess,
    planWithoutEntitlement,
    staffWithoutPermissions,
    total: unverified + inactive + neverLoggedIn + paidWithoutAccess + planWithoutEntitlement + staffWithoutPermissions,
  }
}

function formatPermission(permission: string) {
  return permission
    .split(':')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ')
}

function applyStudentAccountMutation(data: AdminUsersAccess, updated: AdminUserAccessRow): AdminUsersAccess {
  const users = data.users.map((user) => (
    user.user_id === updated.user_id ? updated : user
  ))
  return applyUserAccessRows(data, users)
}

function applyStudentAccountCreate(data: AdminUsersAccess, created: AdminUserAccessRow): AdminUsersAccess {
  const users = [created, ...data.users.filter((user) => user.user_id !== created.user_id)]
  return applyUserAccessRows(data, users)
}

function applyManualAccessGrantToData(
  data: AdminUsersAccess,
  userId: number,
  grant: AdminManualAccessGrant,
): AdminUsersAccess {
  if (grant.status !== 'completed') return data

  const activeDelta = grant.action === 'grant' ? 1 : -1
  const totalDelta = grant.action === 'grant' ? 1 : 0
  let usersWithActiveDelta = 0
  const users = data.users.map((user) => {
    if (user.user_id !== userId) return user
    const nextActiveEntitlements = Math.max(0, user.active_entitlements + activeDelta)
    const nextTotalEntitlements = Math.max(0, user.total_entitlements + totalDelta)
    if (user.active_entitlements <= 0 && nextActiveEntitlements > 0) usersWithActiveDelta = 1
    if (user.active_entitlements > 0 && nextActiveEntitlements <= 0) usersWithActiveDelta = -1
    return {
      ...user,
      active_entitlements: nextActiveEntitlements,
      total_entitlements: nextTotalEntitlements,
    }
  })

  return {
    ...data,
    users,
    summary: {
      ...data.summary,
      active_entitlements: Math.max(0, data.summary.active_entitlements + activeDelta),
      users_with_active_entitlements: Math.max(
        0,
        data.summary.users_with_active_entitlements + usersWithActiveDelta,
      ),
    },
    entitlements_by_status: {
      ...data.entitlements_by_status,
      active: Math.max(0, (data.entitlements_by_status.active ?? 0) + activeDelta),
      ...(grant.action === 'revoke'
        ? { revoked: (data.entitlements_by_status.revoked ?? 0) + 1 }
        : {}),
    },
  }
}

function applyUserAccessRows(data: AdminUsersAccess, users: AdminUserAccessRow[]): AdminUsersAccess {
  const nonStaffUsers = users.filter((user) => !user.is_staff)

  return {
    ...data,
    users,
    summary: {
      ...data.summary,
      total_users: nonStaffUsers.length,
      active_users: nonStaffUsers.filter((user) => user.is_active).length,
      verified_users: nonStaffUsers.filter((user) => user.is_email_verified).length,
      staff_users: users.filter((user) => user.is_staff).length,
      pro_users: nonStaffUsers.filter((user) => user.is_pro).length,
    },
    users_by_role: countBy(nonStaffUsers, (user) => user.role || 'student'),
    users_by_tier: countBy(nonStaffUsers, (user) => studentTierForForm(user) ?? 'basic'),
  }
}

function countBy(users: AdminUserAccessRow[], keyForUser: (user: AdminUserAccessRow) => string) {
  return users.reduce<Record<string, number>>((accumulator, user) => {
    const key = keyForUser(user)
    accumulator[key] = (accumulator[key] ?? 0) + 1
    return accumulator
  }, {})
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
