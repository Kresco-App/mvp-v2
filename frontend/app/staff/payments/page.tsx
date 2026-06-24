'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Copy, RefreshCw, ShieldCheck, Ticket, UserRound } from 'lucide-react'

import KrescoWordmark from '@/components/KrescoWordmark'
import {
  EMPTY_STAFF_PAYMENT_DASHBOARD,
  createStaffPaymentRequest,
  formatMoneyCentimes,
  formatNumber,
  getStaffPaymentDashboard,
  type StaffPaymentRequest,
} from '@/lib/founderOps'
import { apiDataErrorMessage } from '@/lib/apiData'

const panel = 'rounded-[16px] border border-[#e6ebf2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]'
const input = 'h-10 w-full rounded-[10px] border border-[#d9e1ec] bg-white px-3 text-[13px] font-bold text-[#1f2937] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]'
const initialDashboardState = {
  dashboard: EMPTY_STAFF_PAYMENT_DASHBOARD,
  loading: true,
  error: '',
}

export default function StaffPaymentsPage() {
  const [{ dashboard, loading, error }, setDashboardState] = useState(initialDashboardState)
  const [created, setCreated] = useState<StaffPaymentRequest | null>(null)
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

  const selectedTemplate = useMemo(
    () => dashboard.templates.find((template) => String(template.id) === form.template_id) ?? null,
    [dashboard.templates, form.template_id],
  )

  function selectTemplate(templateId: string) {
    const template = dashboard.templates.find((item) => String(item.id) === templateId)
    setForm((value) => ({
      ...value,
      template_id: templateId,
      amount: template ? String(template.amount_centimes / 100) : value.amount,
    }))
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreated(null)
    try {
      const request = await createStaffPaymentRequest({
        template_id: Number(form.template_id),
        payment_method: form.payment_method,
        provider_reference: form.provider_reference,
        amount_centimes: Math.round(Number(form.amount) * 100),
        student_name: form.student_name,
        student_phone: form.student_phone,
        student_email: form.student_email || undefined,
        proof_url: form.proof_url || undefined,
        notes: form.notes || undefined,
      })
      setCreated(request)
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
      toast.success('One-use code generated.')
    } catch (submitError) {
      toast.error(apiDataErrorMessage(submitError, 'Could not generate code.'))
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-[#1f2937] sm:px-6 lg:px-8">
      <header className="mx-auto mb-5 flex max-w-[1220px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#d9e1ec] bg-white text-[#6b7280]">
            <ArrowLeft size={17} />
          </Link>
          <div className="flex h-10 items-center"><KrescoWordmark /></div>
        </div>
        <button type="button" onClick={() => { void loadDashboard() }} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-black text-white">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="mx-auto max-w-[1220px]">
        <section className="mb-5 grid gap-4 md:grid-cols-4">
          <Stat label="Monthly quota" value={`${formatNumber(dashboard.profile.used_codes_this_month)} / ${formatNumber(dashboard.profile.monthly_code_limit)}`} />
          <Stat label="Codes left" value={formatNumber(dashboard.profile.remaining_codes_this_month)} />
          <Stat label="Collected" value={formatMoneyCentimes(dashboard.profile.used_amount_this_month_centimes)} />
          <Stat label="Status" value={dashboard.profile.status} />
        </section>

        {error && <div className="mb-4 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#b91c1c]">{error}</div>}

        <section className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form onSubmit={submitPayment} className={`${panel} p-5`}>
            <div className="mb-4 flex items-center gap-2 text-[17px] font-black text-[#111827]">
              <Ticket size={18} className="text-[#2563eb]" /> Generate payment code
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
            <div className="grid grid-cols-2 gap-3">
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
              <input required aria-label="Transfer reference" value={form.provider_reference} onChange={(event) => setForm((value) => ({ ...value, provider_reference: event.target.value }))} className={input} placeholder="Bank or cash receipt reference" />
            </Field>
            <Field label="Student name">
              <input required aria-label="Student name" value={form.student_name} onChange={(event) => setForm((value) => ({ ...value, student_name: event.target.value }))} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
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
            <button type="submit" disabled={!selectedTemplate || loading} className="mt-2 h-10 w-full rounded-[10px] bg-[#2563eb] text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              Generate one-use code
            </button>
          </form>

          <div className="grid gap-5">
            {created && (
              <section className={`${panel} border-[#bfdbfe] p-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="m-0 text-[12px] font-black uppercase text-[#2563eb]">Generated code</p>
                    <h1 className="m-0 mt-1 font-mono text-[34px] font-black tracking-[0.08em] text-[#111827]">{created.code.code}</h1>
                    <p className="m-0 mt-1 text-[13px] font-bold text-[#6b7280]">
                      {created.student_name} - {formatMoneyCentimes(created.amount_centimes)} - {created.payment_method}
                    </p>
                  </div>
                  <button type="button" onClick={() => copyCode(created.code.code)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-[#111827] px-4 text-[13px] font-black text-white">
                    <Copy size={15} /> Copy code
                  </button>
                </div>
              </section>
            )}

            <section className={`${panel} p-5`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[17px] font-black text-[#111827]">Recent codes</h2>
                  <p className="m-0 mt-1 text-[13px] font-semibold text-[#9ca3af]">Only your generated codes are shown here.</p>
                </div>
                <span className="rounded-[10px] bg-[#eef3ff] px-3 py-1.5 text-[12px] font-black text-[#2563eb]">
                  {dashboard.requests.length} loaded
                </span>
              </div>
              <div className="grid gap-2">
                {dashboard.requests.map((request) => (
                  <article key={request.id} className="grid gap-3 rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3 md:grid-cols-[1fr_150px_132px] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-[#2563eb] shadow-sm"><UserRound size={16} /></span>
                        <div className="min-w-0">
                          <p className="m-0 truncate text-[13px] font-black text-[#111827]">{request.student_name}</p>
                          <p className="m-0 truncate text-[12px] font-bold text-[#9ca3af]">{request.student_phone} - {request.provider_reference}</p>
                        </div>
                      </div>
                    </div>
                    <p className="m-0 text-[13px] font-black text-[#111827]">{formatMoneyCentimes(request.amount_centimes)}</p>
                    <button type="button" onClick={() => copyCode(request.code.code)} className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-white px-3 font-mono text-[12px] font-black text-[#2563eb] shadow-sm">
                      {request.code.code}
                    </button>
                  </article>
                ))}
                {!dashboard.requests.length && <p className="m-0 rounded-[12px] border border-dashed border-[#d9e1ec] py-10 text-center text-[13px] font-bold text-[#9ca3af]">No codes generated yet.</p>}
              </div>
            </section>

            <section className={`${panel} p-5`}>
              <div className="mb-3 flex items-center gap-2 text-[17px] font-black text-[#111827]">
                <ShieldCheck size={18} className="text-[#2563eb]" /> Allowed templates
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {dashboard.templates.map((template) => (
                  <div key={template.id} className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] p-3">
                    <p className="m-0 text-[13px] font-black text-[#111827]">{template.name}</p>
                    <p className="m-0 mt-1 text-[12px] font-bold text-[#9ca3af]">
                      {template.plan} - {template.duration_days} days - {formatMoneyCentimes(template.amount_centimes)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="m-0 text-[12px] font-black uppercase text-[#9ca3af]">{label}</p>
      <p className="m-0 mt-2 text-[22px] font-black leading-none text-[#111827] capitalize">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-3 block text-[12px] font-black uppercase text-[#9ca3af]"><span className="mb-1.5 block">{label}</span>{children}</label>
}

async function copyCode(value: string) {
  await navigator.clipboard.writeText(value)
  toast.success('Code copied.')
}
