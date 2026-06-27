'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  PackagePlus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'

import SegmentedTabs from '@/components/SegmentedTabs'
import {
  AdminAlert,
  AdminMonthPicker,
  AdminPageHeader,
  AdminProgressBar,
  AdminTable,
  AdminTableActionButton,
  adminButtonClass,
  adminMetricStripFiveClass,
  adminMetricTileClass,
  adminMonthInputClass,
  adminMotionSafeClass,
  adminPageClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminTableCellClass,
  adminTableHeadCellClass,
  adminTableHeadClass,
  adminTableHeadRowClass,
  adminTableRowClass,
} from '@/components/admin/AdminDesign'
import {
  EMPTY_FOUNDER_DASHBOARD,
  createRedemptionTemplate,
  formatMoneyCentimes,
  formatNumber,
  getFounderDashboard,
  getRedemptionTemplates,
  getStaffPaymentProfiles,
  getStaffPaymentRequests,
  moneyInputToCentimes,
  upsertStaffPaymentProfile,
  type FounderDashboard,
  type RedemptionCodeTemplate,
  type StaffPaymentProfile,
  type StaffPaymentRequest,
} from '@/lib/founderOps'
import { apiDataErrorMessage } from '@/lib/apiData'

type StaffOpsView = 'overview' | 'templates' | 'allowances' | 'ledger'

type StaffOpsState = {
  dashboard: FounderDashboard
  templates: RedemptionCodeTemplate[]
  profiles: StaffPaymentProfile[]
  requests: StaffPaymentRequest[]
  loading: boolean
  error: string
}

const staffOpsViews: Array<{ value: StaffOpsView; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'templates', label: 'Templates' },
  { value: 'allowances', label: 'Allowances' },
  { value: 'ledger', label: 'Ledger' },
]

const initialOpsState: StaffOpsState = {
  dashboard: EMPTY_FOUNDER_DASHBOARD,
  templates: [],
  profiles: [],
  requests: [],
  loading: true,
  error: '',
}

export default function AdminStaffPaymentsPage() {
  const [{ dashboard, templates, profiles, requests, loading, error }, setOpsState] = useState<StaffOpsState>(initialOpsState)
  const [month, setMonth] = useState(() => currentMonth())
  const [view, setView] = useState<StaffOpsView>('overview')
  const [busyAction, setBusyAction] = useState<'template' | 'profile' | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    plan: 'pro',
    tier: 'pro',
    subject_scope: 'all' as 'all' | 'selected',
    subject_ids: '',
    duration_days: '30',
    amount: '',
    status: 'active' as 'active' | 'archived',
  })
  const [profileForm, setProfileForm] = useState({
    user_id: '',
    display_name: '',
    status: 'active' as 'active' | 'paused',
    monthly_code_limit: '0',
    monthly_amount_limit: '',
    allowed_template_ids: [] as number[],
  })

  const loadOpsWorkspace = useCallback(async (targetMonth: string, isAlive: () => boolean = () => true) => {
    setOpsState((state) => ({ ...state, loading: true, error: '' }))
    if (!isAlive()) return
    try {
      const [nextDashboard, nextTemplates, nextProfiles, nextRequests] = await Promise.all([
        getFounderDashboard(targetMonth),
        getRedemptionTemplates(true),
        getStaffPaymentProfiles(200),
        getStaffPaymentRequests(200),
      ])
      if (isAlive()) {
        setOpsState({
          dashboard: nextDashboard,
          templates: nextTemplates,
          profiles: nextProfiles,
          requests: nextRequests,
          loading: false,
          error: '',
        })
      }
    } catch (loadError) {
      if (!isAlive()) return
      setOpsState((state) => ({
        ...state,
        loading: false,
        error: apiDataErrorMessage(loadError, 'Staff payment code operations could not be loaded.'),
      }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadOpsWorkspace(month, () => alive)
    return () => { alive = false }
  }, [loadOpsWorkspace, month])

  const staffCodes = dashboard.staff_codes
  const activeTemplateCount = templates.filter((template) => template.status === 'active').length
  const profileSignals = useMemo(() => buildProfileSignals(profiles), [profiles])
  const suspiciousSignals = useMemo(() => buildSuspiciousSignals(requests), [requests])
  const codeStatusCounts = useMemo(() => buildCodeStatusCounts(requests), [requests])
  const staffRows = useMemo(() => buildStaffRows(profiles, requests), [profiles, requests])

  function refresh() {
    void loadOpsWorkspace(month)
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyAction) return
    const amountCentimes = moneyInputToCentimes(templateForm.amount)
    if (amountCentimes === null) {
      showToastError('Enter a valid package amount.')
      return
    }
    const durationDays = Number(templateForm.duration_days)
    if (!Number.isInteger(durationDays) || durationDays < 0) {
      showToastError('Enter a valid package duration.')
      return
    }
    const subjectIds = parseSubjectIds(templateForm.subject_ids)
    if (templateForm.subject_scope === 'selected' && !subjectIds.length) {
      showToastError('Selected-subject templates need at least one subject id.')
      return
    }

    setBusyAction('template')
    try {
      await createRedemptionTemplate({
        name: templateForm.name,
        plan: templateForm.plan,
        tier: templateForm.tier,
        subject_scope: templateForm.subject_scope,
        subject_ids: templateForm.subject_scope === 'selected' ? subjectIds : [],
        duration_days: durationDays,
        amount_centimes: amountCentimes,
        status: templateForm.status,
      })
      setTemplateForm((value) => ({ ...value, name: '', subject_ids: '', amount: '' }))
      refresh()
      showToastSuccess('Code template created.')
    } catch (submitError) {
      showToastError(apiDataErrorMessage(submitError, 'Could not create code template.'))
    } finally {
      setBusyAction(null)
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyAction) return
    const userId = Number(profileForm.user_id)
    const monthlyCodeLimit = Number(profileForm.monthly_code_limit)
    const amountLimit = profileForm.monthly_amount_limit.trim()
      ? moneyInputToCentimes(profileForm.monthly_amount_limit)
      : 0
    if (!Number.isInteger(userId) || userId <= 0) {
      showToastError('Enter a valid staff user id.')
      return
    }
    if (!Number.isInteger(monthlyCodeLimit) || monthlyCodeLimit < 0) {
      showToastError('Enter a valid monthly code allowance.')
      return
    }
    if (amountLimit === null) {
      showToastError('Enter a valid monthly amount cap.')
      return
    }

    setBusyAction('profile')
    try {
      const updated = await upsertStaffPaymentProfile(userId, {
        display_name: profileForm.display_name || undefined,
        status: profileForm.status,
        monthly_code_limit: monthlyCodeLimit,
        monthly_amount_limit_centimes: amountLimit,
        allowed_template_ids: profileForm.allowed_template_ids,
      })
      setOpsState((state) => ({
        ...state,
        profiles: upsertProfile(state.profiles, updated),
      }))
      showToastSuccess('Staff allowance saved.')
    } catch (submitError) {
      showToastError(apiDataErrorMessage(submitError, 'Could not save staff allowance.'))
    } finally {
      setBusyAction(null)
    }
  }

  function editProfile(profile: StaffPaymentProfile) {
    setView('allowances')
    setProfileForm({
      user_id: String(profile.user_id),
      display_name: profile.display_name,
      status: profile.status === 'paused' ? 'paused' : 'active',
      monthly_code_limit: String(profile.monthly_code_limit),
      monthly_amount_limit: profile.monthly_amount_limit_centimes ? String(profile.monthly_amount_limit_centimes / 100) : '',
      allowed_template_ids: profile.allowed_template_ids,
    })
  }

  function toggleAllowedTemplate(templateId: number) {
    setProfileForm((value) => {
      const exists = value.allowed_template_ids.includes(templateId)
      return {
        ...value,
        allowed_template_ids: exists
          ? value.allowed_template_ids.filter((id) => id !== templateId)
          : [...value.allowed_template_ids, templateId],
      }
    })
  }

  return (
    <main className={adminPageClass}>
      <AdminPageHeader
        icon={Ticket}
        title="Staff payment codes"
        action={(
          <>
            <AdminMonthPicker label="Staff code month" value={month} onChange={setMonth} />
            <button type="button" aria-label="Refresh staff payment codes" title="Refresh" onClick={refresh} className={`${adminPrimaryButtonClass} px-3`}>
              <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
            </button>
          </>
        )}
      />

      {error && (
        <AdminAlert tone="danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </AdminAlert>
      )}

      <section className={adminMetricStripFiveClass}>
        <Metric label="Generated" value={formatNumber(staffCodes.generated_month)} loading={loading} />
        <Metric label="Redeemed" value={formatNumber(staffCodes.redeemed_month)} loading={loading} tone="good" />
        <Metric label="Unused" value={formatNumber(staffCodes.unused_total)} loading={loading} tone={staffCodes.unused_total ? 'warn' : 'default'} />
        <Metric label="Revenue" value={formatMoneyCentimes(staffCodes.redeemed_staff_revenue_centimes)} loading={loading} />
        <Metric label="Active staff" value={formatNumber(profileSignals.active)} loading={loading} />
      </section>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs label="Staff payment code operations" value={view} options={staffOpsViews} onChange={setView} />
        <div className="grid grid-cols-3 gap-2 text-left sm:flex">
          <Signal label="Templates" value={formatNumber(activeTemplateCount)} />
          <Signal label="Review flags" value={formatNumber(suspiciousSignals.reviewFlags)} tone={suspiciousSignals.reviewFlags ? 'warn' : 'default'} />
          <Signal label="Duplicate refs" value={formatNumber(suspiciousSignals.duplicateReferenceCount)} tone={suspiciousSignals.duplicateReferenceCount ? 'warn' : 'good'} />
        </div>
      </div>

      {view === 'overview' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <div className={`${adminPanelClass} overflow-hidden`}>
            <div className="grid border-b border-[color:var(--border)] bg-[color:var(--surface-page)] lg:grid-cols-3">
              <OverviewCell icon={Ticket} label="Unused codes" value={formatNumber(codeStatusCounts.unused)} tone={codeStatusCounts.unused ? 'warn' : 'default'} />
              <OverviewCell icon={CheckCircle2} label="Redeemed codes" value={formatNumber(codeStatusCounts.redeemed)} tone="good" />
              <OverviewCell icon={ShieldAlert} label="Needs review" value={formatNumber(codeStatusCounts.review)} tone={codeStatusCounts.review ? 'warn' : 'default'} />
            </div>
            <div className="p-5">
              <h2 className="m-0 mb-4 text-[16px] font-black text-[color:var(--text-primary)]">Staff activity</h2>
              <div className="grid gap-3">
                {staffRows.slice(0, 6).map((row) => (
                  <StaffRow key={row.userId} row={row} onEdit={() => editProfile(row.profile)} />
                ))}
                {!staffRows.length && <EmptyState label="No staff payment profiles yet." />}
              </div>
            </div>
          </div>

          <div className={`${adminPanelClass} p-5`}>
            <h2 className="m-0 mb-4 text-[16px] font-black text-[color:var(--text-primary)]">Suspicious references</h2>
            <div className="grid gap-3">
              <RiskLine label="Duplicate references" value={suspiciousSignals.duplicateReferenceCount} detail="Exact duplicates are blocked by the API and database constraint." />
              <RiskLine label="Needs review" value={suspiciousSignals.reviewFlags} detail="Rows marked for operator review." />
              <RiskLine label="Older unused codes" value={suspiciousSignals.staleUnused} detail="Generated more than 14 days ago and not redeemed." />
              <RiskLine label="Amount mismatches" value={suspiciousSignals.amountMismatches} detail="Request amount differs from the generated code amount." />
            </div>
          </div>
        </section>
      )}

      {view === 'templates' && (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={submitTemplate} className={`${adminPanelClass} p-5`}>
            <div className="mb-4 flex items-center gap-2 text-[16px] font-black text-[color:var(--text-primary)]">
              <PackagePlus size={17} className="text-[color:var(--primary)]" /> Code template
            </div>
            <Field label="Template name">
              <input required aria-label="Template name" value={templateForm.name} onChange={(event) => setTemplateForm((value) => ({ ...value, name: event.target.value }))} className={adminMonthInputClass} placeholder="Pro monthly WhatsApp" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">
                <input required aria-label="Plan" value={templateForm.plan} onChange={(event) => setTemplateForm((value) => ({ ...value, plan: event.target.value }))} className={adminMonthInputClass} />
              </Field>
              <Field label="Tier">
                <select aria-label="Tier" value={templateForm.tier} onChange={(event) => setTemplateForm((value) => ({ ...value, tier: event.target.value }))} className={adminMonthInputClass}>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="vip">vip</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration days">
                <input required aria-label="Duration days" inputMode="numeric" value={templateForm.duration_days} onChange={(event) => setTemplateForm((value) => ({ ...value, duration_days: event.target.value }))} className={adminMonthInputClass} />
              </Field>
              <Field label="Amount MAD">
                <input required aria-label="Template amount MAD" inputMode="decimal" value={templateForm.amount} onChange={(event) => setTemplateForm((value) => ({ ...value, amount: event.target.value }))} className={adminMonthInputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subjects">
                <select aria-label="Subject scope" value={templateForm.subject_scope} onChange={(event) => setTemplateForm((value) => ({ ...value, subject_scope: event.target.value as 'all' | 'selected' }))} className={adminMonthInputClass}>
                  <option value="all">all</option>
                  <option value="selected">selected</option>
                </select>
              </Field>
              <Field label="Status">
                <select aria-label="Template status" value={templateForm.status} onChange={(event) => setTemplateForm((value) => ({ ...value, status: event.target.value as 'active' | 'archived' }))} className={adminMonthInputClass}>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </Field>
            </div>
            <Field label="Subject IDs">
              <input aria-label="Subject IDs" value={templateForm.subject_ids} onChange={(event) => setTemplateForm((value) => ({ ...value, subject_ids: event.target.value }))} className={adminMonthInputClass} placeholder="12, 13, 14" />
            </Field>
            <button type="submit" disabled={busyAction === 'template'} className={`mt-2 w-full ${adminPrimaryButtonClass}`}>
              <PackagePlus size={15} /> {busyAction === 'template' ? 'Creating...' : 'Create template'}
            </button>
          </form>

          <TemplatesTable templates={templates} loading={loading} />
        </section>
      )}

      {view === 'allowances' && (
        <section className="grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
          <form onSubmit={submitProfile} className={`${adminPanelClass} p-5`}>
            <div className="mb-4 flex items-center gap-2 text-[16px] font-black text-[color:var(--text-primary)]">
              <SlidersHorizontal size={17} className="text-[color:var(--primary)]" /> Staff allowances
            </div>
            <Field label="Staff user ID">
              <input required aria-label="Staff user ID" inputMode="numeric" value={profileForm.user_id} onChange={(event) => setProfileForm((value) => ({ ...value, user_id: event.target.value }))} className={adminMonthInputClass} />
            </Field>
            <Field label="Display name">
              <input aria-label="Display name" value={profileForm.display_name} onChange={(event) => setProfileForm((value) => ({ ...value, display_name: event.target.value }))} className={adminMonthInputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly quota">
                <input required aria-label="Monthly code quota" inputMode="numeric" value={profileForm.monthly_code_limit} onChange={(event) => setProfileForm((value) => ({ ...value, monthly_code_limit: event.target.value }))} className={adminMonthInputClass} />
              </Field>
              <Field label="Amount cap MAD">
                <input aria-label="Monthly amount cap MAD" inputMode="decimal" value={profileForm.monthly_amount_limit} onChange={(event) => setProfileForm((value) => ({ ...value, monthly_amount_limit: event.target.value }))} className={adminMonthInputClass} placeholder="0 = unlimited" />
              </Field>
            </div>
            <Field label="Status">
              <select aria-label="Staff payment status" value={profileForm.status} onChange={(event) => setProfileForm((value) => ({ ...value, status: event.target.value as 'active' | 'paused' }))} className={adminMonthInputClass}>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </Field>
            <div className="mb-4">
              <p className="m-0 mb-2 text-[12px] font-black uppercase text-[color:var(--text-tertiary)]">Allowed packages</p>
              <div className="max-h-[230px] overflow-auto rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-page)] p-2">
                {templates.filter((template) => template.status === 'active').map((template) => {
                  const selected = profileForm.allowed_template_ids.includes(template.id)
                  return (
                    <label key={template.id} className="flex cursor-pointer items-center gap-3 rounded-[11px] px-3 py-2 text-[13px] font-bold text-[color:var(--text-secondary)] transition-[background-color] duration-150 ease-out hover:bg-white">
                      <input type="checkbox" checked={selected} onChange={() => toggleAllowedTemplate(template.id)} className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--primary)] focus:ring-[color:var(--primary-soft)]" />
                      <span className="min-w-0 flex-1 truncate">{template.name}</span>
                      <span className="shrink-0 text-[12px] font-black text-[color:var(--text-tertiary)]">{formatMoneyCentimes(template.amount_centimes)}</span>
                    </label>
                  )
                })}
                {!activeTemplateCount && <p className="m-0 py-8 text-center text-[13px] font-bold text-[color:var(--text-tertiary)]">No active templates.</p>}
              </div>
            </div>
            <button type="submit" disabled={busyAction === 'profile'} className={`w-full ${adminPrimaryButtonClass}`}>
              <Save size={15} /> {busyAction === 'profile' ? 'Saving...' : 'Save allowance'}
            </button>
          </form>

          <ProfilesTable profiles={profiles} templates={templates} loading={loading} onEdit={editProfile} />
        </section>
      )}

      {view === 'ledger' && <RequestsTable requests={requests} templates={templates} loading={loading} />}
    </main>
  )
}

function Metric({ label, value, loading, tone = 'default' }: { label: string; value: string; loading: boolean; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--text-primary)]'
  return (
    <article className={adminMetricTileClass}>
      <p className="m-0 text-[12px] font-black uppercase text-[color:var(--text-tertiary)]">{label}</p>
      <p className={`m-0 mt-3 text-[25px] font-black leading-none tabular-nums ${toneClass}`}>{loading ? '-' : value}</p>
    </article>
  )
}

function Signal({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--text-primary)]'
  return (
    <div className="rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2 shadow-sm">
      <p className="m-0 text-[11px] font-black uppercase text-[color:var(--text-tertiary)]">{label}</p>
      <p className={`m-0 mt-1 text-[15px] font-black leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function OverviewCell({ icon: Icon, label, value, tone = 'default' }: { icon: LucideIcon; label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[color:var(--primary)]'
  return (
    <div className="border-b border-[color:var(--border)] p-5 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <span className={`grid h-11 w-11 place-items-center rounded-[13px] bg-white shadow-sm ${toneClass}`}><Icon size={19} /></span>
      <p className="m-0 mt-4 text-[12px] font-black uppercase text-[color:var(--text-tertiary)]">{label}</p>
      <p className={`m-0 mt-1 text-[26px] font-black leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function StaffRow({ row, onEdit }: { row: StaffOpsStaffRow; onEdit: () => void }) {
  const percent = percentage(row.profile.used_codes_this_month, row.profile.monthly_code_limit)
  return (
    <article className="grid gap-3 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-page)] p-3 lg:grid-cols-[minmax(0,1fr)_160px_120px] lg:items-center">
      <div className="min-w-0">
        <p className="m-0 truncate text-[13px] font-black text-[color:var(--text-primary)]">{row.profile.display_name || `Staff #${row.userId}`}</p>
        <p className="m-0 mt-1 text-[12px] font-bold text-[color:var(--text-tertiary)]">Staff #{row.userId} - {row.requestCount} generated</p>
        <div className="mt-3">
          <AdminProgressBar value={percent} className="h-2 bg-white" tone={percent >= 90 ? 'warn' : 'primary'} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px] font-black">
        <span className="rounded-[10px] bg-white px-3 py-2 text-[color:var(--text-secondary)]">{formatNumber(row.profile.remaining_codes_this_month)} left</span>
        <span className="rounded-[10px] bg-white px-3 py-2 text-[#059669]">{formatNumber(row.redeemedCount)} used</span>
      </div>
      <button type="button" onClick={onEdit} className={adminButtonClass}>
        <UserCog size={15} /> Edit
      </button>
    </article>
  )
}

function RiskLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  const toneClass = value > 0 ? 'text-[#d97706] bg-[#fff7ed]' : 'text-[#059669] bg-[#ecfdf5]'
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-page)] p-3">
      <span className={`grid h-10 w-10 place-items-center rounded-[12px] ${toneClass}`}>
        {value > 0 ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
      </span>
      <div className="min-w-0">
        <p className="m-0 flex items-center justify-between gap-3 text-[13px] font-black text-[color:var(--text-primary)]">
          <span>{label}</span>
          <span className="tabular-nums">{formatNumber(value)}</span>
        </p>
        <p className="m-0 mt-1 text-[12px] font-bold text-[color:var(--text-tertiary)]">{detail}</p>
      </div>
    </div>
  )
}

function TemplatesTable({ templates, loading }: { templates: RedemptionCodeTemplate[]; loading: boolean }) {
  return (
    <section className={`${adminPanelClass} overflow-hidden`}>
      <div className="border-b border-[color:var(--border)] p-5">
        <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">Templates and packages</h2>
      </div>
      <AdminTable minWidthClass="min-w-[840px]">
        <thead className={adminTableHeadClass}>
          <tr className={adminTableHeadRowClass}>
            <th className={adminTableHeadCellClass}>Template</th>
            <th className={adminTableHeadCellClass}>Package</th>
            <th className={adminTableHeadCellClass}>Subjects</th>
            <th className={`${adminTableHeadCellClass} text-right`}>MAD</th>
            <th className={adminTableHeadCellClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} className={adminTableRowClass}>
              <td className={adminTableCellClass}>
                <p className="m-0 font-black text-[color:var(--text-primary)]">{template.name}</p>
                <p className="m-0 mt-1 text-[11px] text-[color:var(--text-tertiary)]">Template #{template.id}</p>
              </td>
              <td className={`${adminTableCellClass} uppercase`}>
                {template.plan} / {template.tier} / {formatNumber(template.duration_days)}d
              </td>
              <td className={adminTableCellClass}>{template.subject_scope === 'all' ? 'All subjects' : `${template.subject_ids.length} selected`}</td>
              <td className={`${adminTableCellClass} text-right font-black text-[color:var(--text-primary)] tabular-nums`}>{formatMoneyCentimes(template.amount_centimes)}</td>
              <td className={adminTableCellClass}><StatusBadge status={template.status} /></td>
            </tr>
          ))}
          {!templates.length && <EmptyTableRow loading={loading} label="No code templates." colSpan={5} />}
        </tbody>
      </AdminTable>
    </section>
  )
}

function ProfilesTable({ profiles, templates, loading, onEdit }: { profiles: StaffPaymentProfile[]; templates: RedemptionCodeTemplate[]; loading: boolean; onEdit: (profile: StaffPaymentProfile) => void }) {
  const templateMap = new Map(templates.map((template) => [template.id, template.name]))
  return (
    <section className={`${adminPanelClass} overflow-hidden`}>
      <div className="border-b border-[color:var(--border)] p-5">
        <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">Allowance management</h2>
      </div>
      <AdminTable minWidthClass="min-w-[920px]">
        <thead className={adminTableHeadClass}>
          <tr className={adminTableHeadRowClass}>
            <th className={adminTableHeadCellClass}>Staff</th>
            <th className={adminTableHeadCellClass}>Quota</th>
            <th className={adminTableHeadCellClass}>Amount cap</th>
            <th className={adminTableHeadCellClass}>Allowed packages</th>
            <th className={adminTableHeadCellClass}>Status</th>
            <th className={`${adminTableHeadCellClass} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.user_id} className={adminTableRowClass}>
              <td className={adminTableCellClass}>
                <p className="m-0 font-black text-[color:var(--text-primary)]">{profile.display_name || `Staff #${profile.user_id}`}</p>
                <p className="m-0 mt-1 text-[11px] text-[color:var(--text-tertiary)]">User #{profile.user_id}</p>
              </td>
              <td className={adminTableCellClass}>
                <p className="m-0 font-black text-[color:var(--text-primary)]">{formatNumber(profile.used_codes_this_month)} / {formatNumber(profile.monthly_code_limit)}</p>
                <p className="m-0 mt-1 text-[11px] text-[color:var(--text-tertiary)]">{formatNumber(profile.remaining_codes_this_month)} left</p>
              </td>
              <td className={adminTableCellClass}>
                {profile.monthly_amount_limit_centimes ? formatMoneyCentimes(profile.monthly_amount_limit_centimes) : 'Unlimited'}
              </td>
              <td className={`${adminTableCellClass} max-w-[320px]`}>
                <span className="line-clamp-2">
                  {profile.allowed_template_ids.map((id) => templateMap.get(id) ?? `#${id}`).join(', ') || '-'}
                </span>
              </td>
              <td className={adminTableCellClass}><StatusBadge status={profile.status} /></td>
              <td className={adminTableCellClass}>
                <div className="flex justify-end">
                  <AdminTableActionButton onClick={() => onEdit(profile)}><UserCog size={14} /> Edit</AdminTableActionButton>
                </div>
              </td>
            </tr>
          ))}
          {!profiles.length && <EmptyTableRow loading={loading} label="No staff allowances." colSpan={6} />}
        </tbody>
      </AdminTable>
    </section>
  )
}

function RequestsTable({ requests, templates, loading }: { requests: StaffPaymentRequest[]; templates: RedemptionCodeTemplate[]; loading: boolean }) {
  const templateMap = new Map(templates.map((template) => [template.id, template.name]))
  return (
    <section className={`${adminPanelClass} overflow-hidden`}>
      <div className="grid border-b border-[color:var(--border)] bg-[color:var(--surface-page)] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5">
          <h2 className="m-0 text-[16px] font-black text-[color:var(--text-primary)]">Generated code ledger</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--border)] p-5 lg:border-l lg:border-t-0">
          <Signal label="Rows" value={formatNumber(requests.length)} />
          <Signal label="Revenue" value={formatMoneyCentimes(sumRequestRevenue(requests))} />
        </div>
      </div>
      <AdminTable minWidthClass="min-w-[1040px]">
        <thead className={adminTableHeadClass}>
          <tr className={adminTableHeadRowClass}>
            <th className={adminTableHeadCellClass}>Staff</th>
            <th className={adminTableHeadCellClass}>Student</th>
            <th className={adminTableHeadCellClass}>Reference</th>
            <th className={adminTableHeadCellClass}>Package</th>
            <th className={`${adminTableHeadCellClass} text-right`}>MAD</th>
            <th className={adminTableHeadCellClass}>Status</th>
            <th className={`${adminTableHeadCellClass} text-right`}>Code</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className={adminTableRowClass}>
              <td className={adminTableCellClass}>#{request.staff_user_id}</td>
              <td className={adminTableCellClass}>
                <p className="m-0 font-black text-[color:var(--text-primary)]">{request.student_name}</p>
                <p className="m-0 mt-1 text-[11px] text-[color:var(--text-tertiary)]">{request.student_phone}</p>
              </td>
              <td className={adminTableCellClass}>
                <p className="m-0 font-mono text-[12px] font-black text-[color:var(--text-primary)]">{request.provider_reference}</p>
                <p className="m-0 mt-1 text-[11px] capitalize text-[color:var(--text-tertiary)]">{request.payment_method.replaceAll('_', ' ')}</p>
              </td>
              <td className={adminTableCellClass}>{templateMap.get(request.template_id) ?? `#${request.template_id}`}</td>
              <td className={`${adminTableCellClass} text-right font-black text-[color:var(--text-primary)] tabular-nums`}>{formatMoneyCentimes(request.amount_centimes)}</td>
              <td className={adminTableCellClass}><StatusBadge status={request.status === 'code_generated' ? 'unused' : request.status} /></td>
              <td className={adminTableCellClass}>
                <button type="button" onClick={() => copyCode(request.code.code)} className={`ml-auto flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--surface-page)] px-3 font-mono text-[12px] font-black text-[color:var(--primary)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[color:var(--primary-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] active:scale-[0.96] ${adminMotionSafeClass}`}>
                  <Copy size={13} aria-hidden="true" /> {request.code.code}
                </button>
              </td>
            </tr>
          ))}
          {!requests.length && <EmptyTableRow loading={loading} label="No generated staff codes." colSpan={7} />}
        </tbody>
      </AdminTable>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const toneClass = normalized === 'active' || normalized === 'redeemed'
    ? 'bg-[#ecfdf5] text-[#059669]'
    : normalized === 'paused' || normalized === 'archived' || normalized === 'revoked' || normalized === 'needs_review'
      ? 'bg-[#fef2f2] text-[#dc2626]'
      : 'bg-[#fff7ed] text-[#d97706]'
  return <span className={`inline-flex rounded-[999px] px-3 py-1.5 text-[12px] font-black capitalize ${toneClass}`}>{normalized.replaceAll('_', ' ')}</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-[12px] font-black uppercase text-[color:var(--text-tertiary)]">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="m-0 rounded-[14px] border border-dashed border-[color:var(--border)] py-10 text-center text-[13px] font-bold text-[color:var(--text-tertiary)]">{label}</p>
}

function EmptyTableRow({ loading, label, colSpan }: { loading: boolean; label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={`${adminTableCellClass} py-12 text-center text-[13px] font-bold text-[color:var(--text-tertiary)]`}>
        {loading ? 'Loading staff code operations.' : label}
      </td>
    </tr>
  )
}

type StaffOpsStaffRow = {
  userId: number
  profile: StaffPaymentProfile
  requestCount: number
  redeemedCount: number
}

function buildStaffRows(profiles: StaffPaymentProfile[], requests: StaffPaymentRequest[]): StaffOpsStaffRow[] {
  return profiles
    .map((profile) => {
      const profileRequests = requests.filter((request) => request.staff_user_id === profile.user_id)
      return {
        userId: profile.user_id,
        profile,
        requestCount: profileRequests.length,
        redeemedCount: profileRequests.filter((request) => request.status === 'redeemed').length,
      }
    })
    .sort((a, b) => b.requestCount - a.requestCount || a.userId - b.userId)
}

function buildProfileSignals(profiles: StaffPaymentProfile[]) {
  return profiles.reduce(
    (signals, profile) => {
      if (profile.status === 'active') signals.active += 1
      if (profile.status === 'paused') signals.paused += 1
      if (profile.remaining_codes_this_month <= 0 && profile.monthly_code_limit > 0) signals.exhausted += 1
      return signals
    },
    { active: 0, paused: 0, exhausted: 0 },
  )
}

function buildCodeStatusCounts(requests: StaffPaymentRequest[]) {
  return requests.reduce(
    (counts, request) => {
      if (request.status === 'redeemed') counts.redeemed += 1
      else if (request.status === 'needs_review' || request.requires_review) counts.review += 1
      else counts.unused += 1
      return counts
    },
    { unused: 0, redeemed: 0, review: 0 },
  )
}

function buildSuspiciousSignals(requests: StaffPaymentRequest[]) {
  const references = new Map<string, number>()
  let reviewFlags = 0
  let staleUnused = 0
  let amountMismatches = 0
  const now = Date.now()
  for (const request of requests) {
    const key = `${request.payment_method}:${normalizeReference(request.provider_reference)}`
    references.set(key, (references.get(key) ?? 0) + 1)
    if (request.requires_review || request.status === 'needs_review') reviewFlags += 1
    if (request.status === 'code_generated' && isOlderThanDays(request.created_at, now, 14)) staleUnused += 1
    if (request.amount_centimes !== request.code.amount_centimes) amountMismatches += 1
  }
  const duplicateReferenceCount = [...references.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0)
  return { duplicateReferenceCount, reviewFlags, staleUnused, amountMismatches }
}

function parseSubjectIds(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function upsertProfile(profiles: StaffPaymentProfile[], updated: StaffPaymentProfile) {
  const exists = profiles.some((profile) => profile.user_id === updated.user_id)
  return exists
    ? profiles.map((profile) => (profile.user_id === updated.user_id ? updated : profile))
    : [updated, ...profiles]
}

function sumRequestRevenue(requests: StaffPaymentRequest[]) {
  return requests.reduce((total, request) => total + request.amount_centimes, 0)
}

function normalizeReference(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function isOlderThanDays(value: string, now: number, days: number) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return now - time > days * 24 * 60 * 60 * 1000
}

function percentage(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function copyCode(value: string) {
  await navigator.clipboard.writeText(value)
  showToastSuccess('Code copied.')
}
