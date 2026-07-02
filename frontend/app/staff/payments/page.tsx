'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  LogIn,
  LogOut,
  MailPlus,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Ticket,
  UserRound,
} from 'lucide-react'

import KrescoWordmark from '@/components/KrescoWordmark'
import SegmentedTabs from '@/components/SegmentedTabs'
import { AUTH_ROUTES } from '@/lib/authPolicy'
import {
  EMPTY_STAFF_PAYMENT_DASHBOARD,
  createStaffPaymentRequest,
  formatMoneyCentimes,
  formatNumber,
  getStaffPaymentDashboard,
  type RedemptionCodeTemplate,
  type StaffPaymentProfile,
  type StaffPaymentRequest,
  moneyInputToCentimes,
} from '@/lib/founderOps'
import { apiDataErrorMessage } from '@/lib/apiData'
import { getMyProfile, type ProfileUser } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'

type StaffDashboardView = 'generate' | 'ledger' | 'packages'

const staffViews: Array<{ value: StaffDashboardView; label: string }> = [
  { value: 'generate', label: 'Generate' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'packages', label: 'Packages' },
]

const panel = 'rounded-[18px] border border-[#e6ebf2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.045)]'
const staffControlMotionClass = 'transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--primary-soft)] motion-reduce:transition-none motion-reduce:active:scale-100'
const input = 'h-10 w-full rounded-[12px] border border-[#d9e1ec] bg-white px-3 text-[13px] font-bold text-[#1f2937] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-[color:var(--primary)] focus:ring-4 focus:ring-[color:var(--primary-soft)] motion-reduce:transition-none'
const staffSignInPath = `${AUTH_ROUTES.workspaceLogin}?workspace=staff&next=${encodeURIComponent(AUTH_ROUTES.staffHome)}`
const defaultStaffWorkspaceLinks = {
  portalHref: '/admin',
  signInHref: staffSignInPath,
}
const initialDashboardState = {
  dashboard: EMPTY_STAFF_PAYMENT_DASHBOARD,
  loading: true,
  error: '',
}

export default function StaffPaymentsPage() {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  const storeLoggingOut = useAuthStore((state) => state.isLoggingOut)
  const [{ dashboard, loading, error }, setDashboardState] = useState(initialDashboardState)
  const [accountState, setAccountState] = useState<{ profile: ProfileUser | null; loading: boolean; error: string }>({
    profile: null,
    loading: true,
    error: '',
  })
  const [view, setView] = useState<StaffDashboardView>('generate')
  const [created, setCreated] = useState<StaffPaymentRequest | null>(null)
  const [transferVerified, setTransferVerified] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [referenceShaking, setReferenceShaking] = useState(false)
  const [allowanceRequestOpen, setAllowanceRequestOpen] = useState(false)
  const [workspaceLinks, setWorkspaceLinks] = useState(defaultStaffWorkspaceLinks)
  const [signingOut, setSigningOut] = useState(false)
  const [form, setForm] = useState({
    template_id: '',
    payment_method: 'bank_transfer',
    provider_reference: '',
    amount: '',
    student_name: '',
    student_phone: '',
    student_email: '',
    proof_url: '',
    notes: '',
  })

  const loadDashboard = useCallback(async (isAlive: () => boolean = () => true) => {
    setDashboardState((state) => ({ ...state, loading: true, error: '' }))
    if (!isAlive()) return
    try {
      const data = await getStaffPaymentDashboard(60)
      if (isAlive()) {
        setDashboardState({ dashboard: data, loading: false, error: '' })
        setForm((value) => {
          if (value.template_id || !data.templates[0]) return value
          return {
            ...value,
            template_id: String(data.templates[0].id),
            amount: String(data.templates[0].amount_centimes / 100),
          }
        })
      }
    } catch (loadError) {
      if (isAlive()) {
        setDashboardState((state) => ({
          ...state,
          loading: false,
          error: apiDataErrorMessage(loadError, 'Staff payment dashboard could not be loaded.'),
        }))
      }
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadDashboard(() => alive)
    return () => { alive = false }
  }, [loadDashboard])

  const loadAccount = useCallback(async (isAlive: () => boolean = () => true) => {
    setAccountState((state) => ({ ...state, loading: true, error: '' }))
    try {
      const profile = await getMyProfile()
      if (isAlive()) setAccountState({ profile, loading: false, error: '' })
    } catch (loadError) {
      if (isAlive()) {
        setAccountState({
          profile: null,
          loading: false,
          error: apiDataErrorMessage(loadError, 'Sign in required.'),
        })
      }
    }
  }, [])

  useEffect(() => {
    setWorkspaceLinks(buildStaffWorkspaceLinks())
  }, [])

  useEffect(() => {
    let alive = true
    void loadAccount(() => alive)
    return () => { alive = false }
  }, [loadAccount])

  const selectedTemplate = useMemo(
    () => dashboard.templates.find((template) => String(template.id) === form.template_id) ?? null,
    [dashboard.templates, form.template_id],
  )
  const profilePaused = dashboard.profile.status !== 'active'
  const quotaBlocked = dashboard.profile.remaining_codes_this_month <= 0
  const amountLimitBlocked = dashboard.profile.remaining_amount_this_month_centimes === 0
  const canGenerate = Boolean(selectedTemplate) && !loading && !profilePaused && !quotaBlocked && !amountLimitBlocked
  const statusCounts = useMemo(() => buildStatusCounts(dashboard.requests), [dashboard.requests])
  const codeQuotaPercent = percentage(dashboard.profile.used_codes_this_month, dashboard.profile.monthly_code_limit)
  const amountQuotaPercent = dashboard.profile.remaining_amount_this_month_centimes === null
    ? 0
    : percentage(dashboard.profile.used_amount_this_month_centimes, dashboard.profile.monthly_amount_limit_centimes)
  const allowanceRequestText = useMemo(
    () => buildAllowanceRequestText(dashboard.profile, error),
    [dashboard.profile, error],
  )
  const generateLabel = profilePaused
    ? 'Profile paused'
    : quotaBlocked
      ? 'No codes left'
      : amountLimitBlocked
        ? 'Amount cap reached'
        : 'Generate one-use code'

  function selectTemplate(templateId: string) {
    const template = dashboard.templates.find((item) => String(item.id) === templateId)
    setForm((value) => ({
      ...value,
      template_id: templateId,
      amount: template ? String(template.amount_centimes / 100) : value.amount,
    }))
  }

  function updateReference(value: string) {
    setReferenceError('')
    setForm((current) => ({ ...current, provider_reference: value }))
  }

  function showReferenceError(message: string) {
    setReferenceError(message)
    setReferenceShaking(false)
    window.setTimeout(() => setReferenceShaking(true), 0)
    window.setTimeout(() => setReferenceShaking(false), 340)
  }

  function openAllowanceRequest() {
    setAllowanceRequestOpen((open) => !open)
  }

  async function signOut() {
    if (signingOut || storeLoggingOut) return
    setSigningOut(true)
    const loggedOut = await logout()
    if (loggedOut) {
      navigateToHref(workspaceLinks.signInHref, (href) => router.push(href))
      return
    }
    setSigningOut(false)
    showToastError('Could not sign out. Try again.')
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreated(null)
    if (!selectedTemplate) {
      showToastError('Select an allowed template.')
      return
    }
    if (!canGenerate) {
      showToastError('This staff profile cannot generate a code right now.')
      return
    }
    if (!transferVerified) {
      const message = 'Confirm the transfer reference and amount before generating a code.'
      showReferenceError(message)
      showToastError(message)
      return
    }
    const amountCentimes = moneyInputToCentimes(form.amount)
    if (amountCentimes === null || amountCentimes !== selectedTemplate.amount_centimes) {
      showToastError('The amount must match the selected template.')
      return
    }
    try {
      const request = await createStaffPaymentRequest({
        template_id: Number(form.template_id),
        payment_method: form.payment_method,
        provider_reference: form.provider_reference.trim(),
        amount_centimes: amountCentimes,
        student_name: form.student_name.trim(),
        student_phone: form.student_phone.trim(),
        student_email: form.student_email.trim() || undefined,
        proof_url: form.proof_url.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      setCreated(request)
      setTransferVerified(false)
      setReferenceError('')
      setForm((value) => ({
        ...value,
        provider_reference: '',
        student_name: '',
        student_phone: '',
        student_email: '',
        proof_url: '',
        notes: '',
      }))
      void loadDashboard()
      showToastSuccess('One-use code generated.')
    } catch (submitError) {
      const message = apiDataErrorMessage(submitError, 'Could not generate code.')
      if (message.toLowerCase().includes('reference')) showReferenceError(message)
      showToastError(message)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-[#1f2937] sm:px-6 lg:px-8">
      <header className="mx-auto mb-5 flex max-w-[1260px] flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex h-10 items-center"><KrescoWordmark /></div>
          <h1 className="m-0 text-[25px] font-black leading-tight text-[#111827]">Staff payment codes</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StaffAccountControls
            profile={accountState.profile}
            loading={accountState.loading}
            fallbackName={dashboard.profile.display_name}
            portalHref={workspaceLinks.portalHref}
            signInHref={workspaceLinks.signInHref}
            signingOut={signingOut || storeLoggingOut}
            onSignOut={signOut}
          />
          <button
            type="button"
            onClick={openAllowanceRequest}
            aria-controls="staff-allowance-request"
            aria-expanded={allowanceRequestOpen}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e1ec] bg-white px-4 text-[13px] font-black text-[#526070] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] ${staffControlMotionClass}`}
          >
            <MailPlus size={15} aria-hidden="true" /> Request more codes
          </button>
          <button type="button" onClick={() => { void loadDashboard() }} className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[color:var(--primary)] px-4 text-[13px] font-black text-white hover:opacity-90 ${staffControlMotionClass}`}>
            <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1260px]">
        <div id="staff-allowance-request" className="t-panel-slide" data-open={allowanceRequestOpen ? 'true' : 'false'}>
          <section className={`${panel} mb-5 overflow-hidden`}>
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="m-0 text-[12px] font-black uppercase text-[#9ca3af]">Allowance request</p>
                <p className="m-0 mt-1 text-pretty text-[14px] font-bold leading-6 text-[#526070]">
                  Send this request text to operations for a quota or permission review.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={allowanceMailto(dashboard.profile.display_name)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#f7f9fc] px-4 text-[13px] font-black text-[#526070] no-underline hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)] ${staffControlMotionClass}`}>
                  <MailPlus size={15} aria-hidden="true" /> Email ops
                </a>
              </div>
            </div>
            <textarea
              readOnly
              aria-label="Allowance request text"
              value={allowanceRequestText}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-[184px] w-full resize-none border-0 border-t border-[#edf1f7] bg-[#fbfcfe] px-4 py-3 font-mono text-[12px] font-bold leading-5 text-[#526070] outline-none focus:ring-4 focus:ring-[color:var(--primary-soft)]"
            />
          </section>
        </div>

        <section className={`${panel} mb-5 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4`}>
          <Stat label="Monthly quota" value={`${formatNumber(dashboard.profile.used_codes_this_month)} / ${formatNumber(dashboard.profile.monthly_code_limit)}`} loading={loading} />
          <Stat label="Codes left" value={formatNumber(dashboard.profile.remaining_codes_this_month)} loading={loading} tone={quotaBlocked ? 'warn' : 'default'} />
          <Stat label="Collected" value={formatMoneyCentimes(dashboard.profile.used_amount_this_month_centimes)} loading={loading} />
          <Stat label="Status" value={dashboard.profile.status || '-'} loading={loading} tone={profilePaused ? 'warn' : 'good'} />
        </section>

        {error && <Alert tone="danger"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></Alert>}
        {(profilePaused || quotaBlocked || amountLimitBlocked) && (
          <Alert>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{profilePaused ? 'This profile is paused.' : quotaBlocked ? 'Monthly code quota is exhausted.' : 'Monthly amount cap is exhausted.'}</span>
          </Alert>
        )}

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SegmentedTabs label="Staff payment workspace" value={view} options={staffViews} onChange={setView} />
          <div className="grid grid-cols-3 gap-2 text-center sm:flex">
            <MiniMetric label="Unused" value={formatNumber(statusCounts.unused)} tone={statusCounts.unused ? 'warn' : 'default'} />
            <MiniMetric label="Redeemed" value={formatNumber(statusCounts.redeemed)} tone="good" />
            <MiniMetric label="Review" value={formatNumber(statusCounts.review)} tone={statusCounts.review ? 'warn' : 'default'} />
          </div>
        </div>

        {view === 'generate' && (
          <section className="grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
            <form onSubmit={submitPayment} className={`${panel} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-[17px] font-black text-[#111827]">
                <Ticket size={18} className="text-[color:var(--primary)]" /> Generate payment code
              </div>

              <div className="mb-4 grid gap-3 rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
                <QuotaLine label="Code quota" value={`${formatNumber(dashboard.profile.remaining_codes_this_month)} left`} percent={codeQuotaPercent} />
                {dashboard.profile.remaining_amount_this_month_centimes !== null && (
                  <QuotaLine label="Amount cap" value={`${formatMoneyCentimes(dashboard.profile.remaining_amount_this_month_centimes)} left`} percent={amountQuotaPercent} />
                )}
              </div>

              <Field label="Template">
                <select required aria-label="Template" value={form.template_id} onChange={(event) => selectTemplate(event.target.value)} className={input}>
                  <option value="" disabled>Select template</option>
                  {dashboard.templates.map((template) => (
                    <option key={template.id} value={String(template.id)}>
                      {template.name} - {formatMoneyCentimes(template.amount_centimes)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Method">
                  <select aria-label="Method" value={form.payment_method} onChange={(event) => setForm((value) => ({ ...value, payment_method: event.target.value }))} className={input}>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cashplus">CashPlus</option>
                    <option value="ashplus">AshPlus</option>
                  </select>
                </Field>
                <Field label="Amount MAD">
                  <input required aria-label="Amount MAD" type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} className={input} />
                </Field>
              </div>
              <Field label="Transfer reference">
                <span className={`t-input-wrap block ${referenceError ? 'is-error' : ''}`}>
                  <input required aria-label="Transfer reference" value={form.provider_reference} onChange={(event) => updateReference(event.target.value)} className={`t-input ${input} ${referenceError ? 'is-error border-[#fca5a5] focus:border-[#dc2626] focus:ring-[#fee2e2]' : ''} ${referenceShaking ? 'is-shaking' : ''}`} placeholder="Bank or cash receipt reference" />
                  <span className="t-error-msg mt-1.5 block text-[12px] font-bold text-[#dc2626]">{referenceError || 'Reference needs review.'}</span>
                </span>
              </Field>
              <Field label="Student name">
                <input required aria-label="Student name" value={form.student_name} onChange={(event) => setForm((value) => ({ ...value, student_name: event.target.value }))} className={input} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone">
                  <input required aria-label="Phone" value={form.student_phone} onChange={(event) => setForm((value) => ({ ...value, student_phone: event.target.value }))} className={input} />
                </Field>
                <Field label="Email">
                  <input aria-label="Email" type="email" value={form.student_email} onChange={(event) => setForm((value) => ({ ...value, student_email: event.target.value }))} className={input} />
                </Field>
              </div>
              <Field label="Proof URL">
                <input aria-label="Proof URL" value={form.proof_url} onChange={(event) => setForm((value) => ({ ...value, proof_url: event.target.value }))} className={input} placeholder="Optional screenshot link" />
              </Field>
              <Field label="Notes">
                <textarea aria-label="Notes" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} className={`${input} min-h-[88px] py-3`} />
              </Field>
              <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#dbeafe] bg-[#eff6ff] p-3 text-[13px] font-bold text-[#1e3a8a]">
                <input
                  aria-label="Transfer verified"
                  type="checkbox"
                  checked={transferVerified}
                  onChange={(event) => setTransferVerified(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#93c5fd] text-[color:var(--primary)] focus:ring-[color:var(--primary-soft)]"
                />
                <span className="flex min-w-0 gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[color:var(--primary)]" />
                  <span>Transfer reference, amount, and student details are verified.</span>
                </span>
              </label>
              <button type="submit" disabled={!canGenerate} className={`mt-2 h-10 w-full rounded-[12px] bg-[color:var(--primary)] text-[13px] font-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${staffControlMotionClass}`}>
                {generateLabel}
              </button>
            </form>

            <div className="grid gap-5">
              <section className={`${panel} overflow-hidden`}>
                <div className="border-b border-[#edf1f7] p-5">
                  <h2 className="m-0 text-[17px] font-black text-[#111827]">Generated code</h2>
                </div>
                <div className="overflow-hidden p-5">
                  <div className="t-panel-slide" data-open={created ? 'true' : 'false'}>
                    {created && (
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <span className="t-success-check mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-[#ecfdf5] text-[#059669]" data-state="in" aria-hidden="true">
                            <CheckCircle2 size={23} aria-hidden="true" />
                          </span>
                          <p className="m-0 text-[12px] font-black uppercase text-[color:var(--primary)]">Generated code</p>
                          <h3 className="m-0 mt-1 font-mono text-[clamp(24px,4vw,34px)] font-black tracking-[0.08em] text-[#111827]">{created.code.code}</h3>
                          <p className="m-0 mt-1 text-[13px] font-bold text-[#6b7280]">
                            {created.student_name} - {formatMoneyCentimes(created.amount_centimes)} - {formatPaymentMethod(created.payment_method)}
                          </p>
                        </div>
                        <button type="button" onClick={() => copyCode(created.code.code)} className={`inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#111827] px-4 text-[13px] font-black text-white hover:bg-[#374151] ${staffControlMotionClass}`}>
                          <Copy size={15} aria-hidden="true" /> Copy code
                        </button>
                      </div>
                    )}
                  </div>
                  {!created && <p className="m-0 rounded-[14px] border border-dashed border-[#d9e1ec] py-12 text-center text-[13px] font-bold text-[#9ca3af]">Generated codes appear here after a verified transfer.</p>}
                </div>
              </section>

              <RecentCodes requests={dashboard.requests.slice(0, 5)} />
              <TemplateSummary templates={dashboard.templates} />
            </div>
          </section>
        )}

        {view === 'ledger' && <LedgerView requests={dashboard.requests} loading={loading} />}
        {view === 'packages' && <PackagesView templates={dashboard.templates} loading={loading} />}
      </div>
    </main>
  )
}

function StaffAccountControls({
  profile,
  loading,
  fallbackName,
  portalHref,
  signInHref,
  signingOut,
  onSignOut,
}: {
  profile: ProfileUser | null
  loading: boolean
  fallbackName: string
  portalHref: string
  signInHref: string
  signingOut: boolean
  onSignOut: () => void
}) {
  const signedIn = Boolean(profile)
  const displayName = loading
    ? 'Checking account'
    : profile?.full_name || fallbackName || 'Staff account'
  const detail = loading
    ? 'Staff session'
    : profile?.email || 'Sign in required'

  return (
    <div className="flex min-h-12 max-w-full items-center gap-1 rounded-[14px] border border-[#dfe6f0] bg-white p-1 pr-2 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#f7f9fc] text-[color:var(--primary)]">
        {loading ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UserRound size={17} aria-hidden="true" />}
      </span>
      <span className="w-[126px] min-w-0 px-1 sm:w-[190px]">
        <span className="block truncate text-[12px] font-black leading-4 text-[#111827]">{displayName}</span>
        <span className="block truncate text-[11px] font-bold leading-4 text-[#9ca3af]">{detail}</span>
      </span>
      <a
        href={portalHref}
        aria-label="Open admin portal"
        title="Admin portal"
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[10px] text-[#64748b] no-underline hover:bg-[#f7f9fc] hover:text-[color:var(--primary)] lg:w-auto lg:px-3 ${staffControlMotionClass}`}
      >
        <ExternalLink size={15} aria-hidden="true" />
        <span className="hidden text-[12px] font-black lg:inline">Portal</span>
      </a>
      {signedIn ? (
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[10px] text-[#64748b] hover:bg-[#fff1f2] hover:text-[#dc2626] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 lg:w-auto lg:px-3 ${staffControlMotionClass}`}
        >
          {signingOut ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LogOut size={15} aria-hidden="true" />}
          <span className="hidden text-[12px] font-black lg:inline">{signingOut ? 'Signing out' : 'Sign out'}</span>
        </button>
      ) : (
        <a
          href={signInHref}
          aria-label="Sign in"
          title="Sign in"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[color:var(--primary)] text-white no-underline hover:opacity-90 lg:w-auto lg:px-3 ${staffControlMotionClass}`}
        >
          <LogIn size={15} aria-hidden="true" />
          <span className="hidden text-[12px] font-black lg:inline">Sign in</span>
        </a>
      )}
    </div>
  )
}

function RecentCodes({ requests }: { requests: StaffPaymentRequest[] }) {
  return (
    <section className={`${panel} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[17px] font-black text-[#111827]">Recent codes</h2>
        <History size={17} className="text-[#9ca3af]" />
      </div>
      <div className="grid gap-2">
        {requests.map((request) => (
          <article key={request.id} className="grid gap-3 rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3 md:grid-cols-[1fr_142px_132px] md:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-[color:var(--primary)] shadow-sm"><UserRound size={16} /></span>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[13px] font-black text-[#111827]">{request.student_name}</p>
                  <p className="m-0 truncate text-[12px] font-bold text-[#9ca3af]">{request.student_phone} - {request.provider_reference}</p>
                </div>
              </div>
            </div>
            <p className="m-0 text-[13px] font-black text-[#111827] tabular-nums">{formatMoneyCentimes(request.amount_centimes)}</p>
            <button type="button" onClick={() => copyCode(request.code.code)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-white px-3 font-mono text-[12px] font-black text-[color:var(--primary)] shadow-sm hover:bg-[color:var(--primary-soft)] ${staffControlMotionClass}`}>
              {request.code.code}
            </button>
          </article>
        ))}
        {!requests.length && <p className="m-0 rounded-[14px] border border-dashed border-[#d9e1ec] py-10 text-center text-[13px] font-bold text-[#9ca3af]">No codes generated yet.</p>}
      </div>
    </section>
  )
}

function LedgerView({ requests, loading }: { requests: StaffPaymentRequest[]; loading: boolean }) {
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-[#edf1f7] bg-[#fbfcfe] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-[color:var(--primary)]" />
          <h2 className="m-0 text-[17px] font-black text-[#111827]">Recent generated codes and payments</h2>
        </div>
        <span className="rounded-[999px] bg-white px-3 py-1.5 text-[12px] font-black text-[#64748b] shadow-sm">{formatNumber(requests.length)} loaded</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead className="border-b border-[#edf1f7] bg-white text-[11px] font-black uppercase tracking-[0.04em] text-[#9ca3af]">
            <tr>
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Reference</th>
              <th className="px-5 py-3">Package</th>
              <th className="px-5 py-3 text-right">MAD</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Code</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-[#edf1f7] text-[13px] font-bold text-[#526070] last:border-b-0">
                <td className="px-5 py-3">
                  <p className="m-0 font-black text-[#111827]">{request.student_name}</p>
                  <p className="m-0 mt-1 text-[12px] text-[#9ca3af]">{request.student_phone}</p>
                </td>
                <td className="px-5 py-3">
                  <p className="m-0 font-mono text-[12px] font-black text-[#111827]">{request.provider_reference}</p>
                  <p className="m-0 mt-1 text-[11px] capitalize text-[#9ca3af]">{formatPaymentMethod(request.payment_method)}</p>
                </td>
                <td className="px-5 py-3">
                  <p className="m-0 font-black uppercase text-[#111827]">{request.code.tier}</p>
                  <p className="m-0 mt-1 text-[12px] text-[#9ca3af]">{formatNumber(request.code.duration_days)} days</p>
                </td>
                <td className="px-5 py-3 text-right font-black text-[#111827] tabular-nums">{formatMoneyCentimes(request.amount_centimes)}</td>
                <td className="px-5 py-3"><StatusBadge status={request.status} /></td>
                <td className="px-5 py-3 text-right">
                  <button type="button" onClick={() => copyCode(request.code.code)} className={`inline-flex min-h-10 items-center justify-center rounded-[11px] bg-[#f7f9fc] px-3 py-2 font-mono text-[12px] font-black text-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] ${staffControlMotionClass}`}>
                    {request.code.code}
                  </button>
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[13px] font-bold text-[#9ca3af]">
                  {loading ? 'Loading staff payment ledger.' : 'No staff payment codes generated yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PackagesView({ templates, loading }: { templates: RedemptionCodeTemplate[]; loading: boolean }) {
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-[#edf1f7] bg-[#fbfcfe] p-5">
        <PackageCheck size={18} className="text-[color:var(--primary)]" />
        <h2 className="m-0 text-[17px] font-black text-[#111827]">Allowed templates</h2>
      </div>
      <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article key={template.id} className="min-h-[170px] border-b border-[#edf1f7] p-5 md:border-r md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0">
            <p className="m-0 text-[15px] font-black text-[#111827]">{template.name}</p>
            <p className="m-0 mt-2 text-[13px] font-bold text-[#6b7280]">
              {template.plan} - {template.tier} - {template.duration_days} days
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-[999px] bg-[color:var(--primary-soft)] px-3 py-1.5 text-[12px] font-black text-[color:var(--primary)]">{formatMoneyCentimes(template.amount_centimes)}</span>
              <span className="rounded-[999px] bg-[#f7f9fc] px-3 py-1.5 text-[12px] font-black text-[#64748b]">{template.subject_scope === 'all' ? 'All subjects' : `${template.subject_ids.length} subjects`}</span>
            </div>
          </article>
        ))}
        {!templates.length && (
          <p className="m-0 p-12 text-center text-[13px] font-bold text-[#9ca3af] md:col-span-2 xl:col-span-3">
            {loading ? 'Loading allowed templates.' : 'No allowed templates. Ask an admin to assign packages.'}
          </p>
        )}
      </div>
    </section>
  )
}

function TemplateSummary({ templates }: { templates: RedemptionCodeTemplate[] }) {
  return (
    <section className={`${panel} p-5`}>
      <div className="mb-3 flex items-center gap-2 text-[17px] font-black text-[#111827]">
        <ShieldCheck size={18} className="text-[color:var(--primary)]" /> Allowed templates
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {templates.slice(0, 4).map((template) => (
          <div key={template.id} className="rounded-[14px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
            <p className="m-0 text-[13px] font-black text-[#111827]">{template.name}</p>
            <p className="m-0 mt-1 text-[12px] font-bold text-[#9ca3af]">
              {template.plan} - {template.duration_days} days - {formatMoneyCentimes(template.amount_centimes)}
            </p>
          </div>
        ))}
        {!templates.length && <p className="m-0 rounded-[14px] border border-dashed border-[#d9e1ec] py-8 text-center text-[13px] font-bold text-[#9ca3af] md:col-span-2">No package assigned.</p>}
      </div>
    </section>
  )
}

function Stat({ label, value, loading, tone = 'default' }: { label: string; value: string; loading?: boolean; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'
  return (
    <div className="min-h-[112px] border-b border-[#e6ebf2] p-4 tabular-nums sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0">
      <p className="m-0 text-[12px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-3 text-[25px] font-black leading-none capitalize ${toneClass}`}>{loading ? '-' : value}</p>
    </div>
  )
}

function MiniMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'good' }) {
  const toneClass = tone === 'good' ? 'text-[#059669]' : tone === 'warn' ? 'text-[#d97706]' : 'text-[#111827]'
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-white px-3 py-2 text-left shadow-sm">
      <p className="m-0 text-[11px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className={`m-0 mt-1 text-[15px] font-black leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function QuotaLine({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12px] font-black text-[#526070]"><Gauge size={14} className="text-[color:var(--primary)]" /> {label}</span>
        <span className="text-[12px] font-black text-[#111827] tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
        <span className="block h-full rounded-full bg-[color:var(--primary)] transition-[width] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mb-3 block text-[12px] font-black uppercase text-[#9ca3af]"><span className="mb-1.5 block">{label}</span>{children}</label>
}

function Alert({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' }) {
  const toneClass = tone === 'danger'
    ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
    : 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
  return <div className={`mb-4 flex items-start gap-3 rounded-[14px] border px-4 py-3 text-[13px] font-bold ${toneClass}`}>{children}</div>
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const label = normalized === 'code_generated' ? 'unused' : normalized.replaceAll('_', ' ')
  const toneClass = normalized === 'redeemed'
    ? 'bg-[#ecfdf5] text-[#059669]'
    : normalized === 'needs_review' || normalized === 'revoked'
      ? 'bg-[#fef2f2] text-[#dc2626]'
      : 'bg-[#fff7ed] text-[#d97706]'
  return <span className={`inline-flex rounded-[999px] px-3 py-1.5 text-[12px] font-black capitalize ${toneClass}`}>{label}</span>
}

function buildStatusCounts(requests: StaffPaymentRequest[]) {
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

function percentage(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
}

function formatPaymentMethod(value: string) {
  return value.replaceAll('_', ' ')
}

function allowanceMailto(displayName: string) {
  const subject = encodeURIComponent('Staff code allowance request')
  const body = encodeURIComponent(`Staff profile: ${displayName || 'Staff'}\nRequest: Increase monthly code allowance\nReason:\n`)
  return `mailto:operations@kresco.ma?subject=${subject}&body=${body}`
}

function buildAllowanceRequestText(profile: StaffPaymentProfile, dashboardError: string) {
  return [
    'Staff code allowance request',
    `Staff profile: ${profile.display_name || 'Staff'}`,
    `User ID: ${profile.user_id || '-'}`,
    `Status: ${profile.status || '-'}`,
    `Monthly quota: ${formatNumber(profile.used_codes_this_month)} / ${formatNumber(profile.monthly_code_limit)}`,
    `Codes left: ${formatNumber(profile.remaining_codes_this_month)}`,
    `Collected this month: ${formatMoneyCentimes(profile.used_amount_this_month_centimes)}`,
    `Amount cap left: ${profile.remaining_amount_this_month_centimes === null ? 'No cap' : formatMoneyCentimes(profile.remaining_amount_this_month_centimes)}`,
    dashboardError ? `Dashboard error: ${dashboardError}` : '',
    'Request: Please review and increase this staff code allowance.',
    'Reason:',
  ].filter(Boolean).join('\n')
}

async function copyCode(value: string) {
  const copied = await copyTextToClipboard(value)
  if (copied) showToastSuccess('Code copied.')
  else showToastError('Could not copy code.')
}

async function copyTextToClipboard(value: string) {
  if (window.location.protocol !== 'https:' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function buildStaffWorkspaceLinks() {
  return {
    portalHref: staffWorkspaceHref('admin', '/admin'),
    signInHref: staffWorkspaceHref('staff', staffSignInPath),
  }
}

function staffWorkspaceHref(workspace: 'admin' | 'landing' | 'staff', path: string) {
  if (typeof window === 'undefined' || window.location.origin === 'null') return path

  try {
    const url = new URL(path, window.location.origin)
    url.hostname = workspaceHostname(window.location.hostname, workspace)
    return url.href
  } catch {
    return path
  }
}

function workspaceHostname(hostname: string, workspace: 'admin' | 'landing' | 'staff') {
  if (!hasRoutableSubdomain(hostname)) return hostname

  const apex = apexHostname(hostname)
  if (workspace === 'staff') return `staff.${apex}`
  return workspace === 'admin' ? `admin.${apex}` : apex
}

function apexHostname(hostname: string) {
  const routedLabels = new Set(['www', 'app', 'admin', 'prof', 'professor', 'staff'])
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length <= 1) return hostname
  return routedLabels.has(labels[0] ?? '') ? labels.slice(1).join('.') : hostname
}

function hasRoutableSubdomain(hostname: string) {
  return Boolean(
    hostname
    && hostname !== 'localhost'
    && !hostname.endsWith('.localhost')
    && hostname !== '127.0.0.1'
    && hostname !== '::1',
  )
}

function navigateToHref(href: string, push: (href: string) => void) {
  if (typeof window === 'undefined' || window.location.origin === 'null') {
    push(href)
    return
  }

  try {
    const url = new URL(href, window.location.href)
    if (url.origin === window.location.origin) {
      push(`${url.pathname}${url.search}${url.hash}`)
      return
    }
    window.location.assign(url.href)
  } catch {
    push(href)
  }
}
