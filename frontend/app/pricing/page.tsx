'use client'

import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Crown, Zap, BookOpen, Award, ArrowLeft, CreditCard, Landmark, Store, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { apiJsonClient } from '@/lib/apiClient'
import { localizedCopy } from '@/lib/localization'
import { submitManualPaymentProof } from '@/lib/manualPayments'
import {
  DEFAULT_PAYMENT_METHOD,
  createProPaymentRequest,
  submitProviderPaymentForm,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentRequestResult,
} from '@/lib/payments'
import AuthGuard from '@/components/AuthGuard'

const pricingCopy = localizedCopy.pricing
const paymentMethodIcons: Record<PaymentMethod, typeof CreditCard> = {
  cmi: CreditCard,
  bank_transfer: Landmark,
  cashplus: Store,
  ashplus: Receipt,
}

type PaymentSupportState = {
  method: PaymentMethod
  message: string
}

export default function PricingPage() {
  const user = useAuthStore((state) => state.user)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD)
  const [pendingRequest, setPendingRequest] = useState<PaymentRequest | null>(null)
  const [paymentSupport, setPaymentSupport] = useState<PaymentSupportState | null>(null)
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [proofReference, setProofReference] = useState('')
  const [proofPayerName, setProofPayerName] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [isSubmittingProof, setIsSubmittingProof] = useState(false)
  const [proofSubmitted, setProofSubmitted] = useState(false)
  const paymentRequestSeq = useRef(0)

  function clearProofForm() {
    setProofReference('')
    setProofPayerName('')
    setProofUrl('')
    setProofNotes('')
    setProofSubmitted(false)
  }

  async function handlePaymentRequest() {
    if (isCreatingPayment) return
    const requestId = paymentRequestSeq.current + 1
    paymentRequestSeq.current = requestId
    setIsCreatingPayment(true)
    setPaymentSupport(null)
    setPendingRequest(null)
    clearProofForm()
    let result: PaymentRequestResult
    try {
      result = await createProPaymentRequest(apiJsonClient, selectedPaymentMethod)
    } catch {
      result = { status: 'error' as const, message: pricingCopy.supportTitle }
    } finally {
      if (requestId === paymentRequestSeq.current) setIsCreatingPayment(false)
    }
    if (requestId !== paymentRequestSeq.current) return

    if (result.status === 'provider_redirect') {
      submitProviderPaymentForm(result.actionUrl, result.formFields)
      return
    }

    if (result.status === 'pending_manual_review') {
      setPendingRequest(result.request)
      setPaymentSupport(null)
      toast.success(pricingCopy.pendingToast)
      return
    }

    setPaymentSupport({ method: selectedPaymentMethod, message: result.message })
    toast.error(result.message)
  }

  async function handleProofSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingRequest || isSubmittingProof) return

    if (!proofReference.trim() && !proofUrl.trim()) {
      toast.error(pricingCopy.proofRequired)
      return
    }

    setIsSubmittingProof(true)
    const result = await submitManualPaymentProof(apiJsonClient, pendingRequest.id, {
      proof_kind: `${pendingRequest.payment_method}_receipt`,
      provider_reference: proofReference,
      proof_url: proofUrl,
      payer_name: proofPayerName,
      notes: proofNotes,
    })
    setIsSubmittingProof(false)

    if (result.status === 'success') {
      setProofSubmitted(true)
      toast.success(pricingCopy.proofSubmitted)
      return
    }

    toast.error(result.message)
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-950 p-6">
        {/* Back button */}
        <div className="max-w-4xl mx-auto mb-6">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            {pricingCopy.backHome}
          </Link>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-5">
              <Crown size={14} />
              {pricingCopy.badge}
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              {pricingCopy.title}
            </h1>
            <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed">
              {pricingCopy.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Gratuit */}
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-sm">
              <div className="mb-6">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                  <BookOpen size={20} className="text-slate-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">{pricingCopy.freePlan}</h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{pricingCopy.freePrice}</span>
                </div>
                <p className="text-slate-500 text-sm mt-2">{pricingCopy.freeDescription}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {pricingCopy.freeFeatures.map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
                    <CheckCircle2 size={16} className="text-slate-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button type="button"
                disabled
                className="w-full py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold cursor-not-allowed"
              >
                {user?.is_pro ? pricingCopy.previousPlan : pricingCopy.currentPlan}
              </button>
            </div>

            {/* Pro */}
            <div className="bg-slate-950 rounded-2xl p-8 relative overflow-hidden">
              <div className="relative">
                <div className="mb-6">
                  <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-4">
                    <Crown size={20} className="text-indigo-400" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-bold text-white">{pricingCopy.proPlan}</h2>
                    <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pricingCopy.popular}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{pricingCopy.proPrice}</span>
                    <span className="text-slate-500 text-sm">{pricingCopy.oneTime}</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">{pricingCopy.paymentActivation}</p>
                  <p className="text-slate-400 text-sm mt-2">{pricingCopy.proDescription}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {pricingCopy.proFeatures.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                      <CheckCircle2 size={16} className="text-indigo-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {user?.is_pro ? (
                  <div className="w-full py-3 rounded-xl bg-green-500/20 text-green-400 text-sm font-bold text-center">
                    <CheckCircle2 size={16} className="inline mr-2" />
                    {pricingCopy.proActive}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {pricingCopy.paymentMethods.map((method) => {
                        const Icon = paymentMethodIcons[method.value]
                        const isSelected = selectedPaymentMethod === method.value
                        return (
                          <button
                            key={method.value}
                            type="button"
                            onClick={() => {
                              paymentRequestSeq.current += 1
                              setIsCreatingPayment(false)
                              setSelectedPaymentMethod(method.value)
                              setPendingRequest(null)
                              setPaymentSupport(null)
                              clearProofForm()
                            }}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                              isSelected
                                ? 'border-indigo-400 bg-indigo-500/15 text-white'
                                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                            }`}
                            aria-pressed={isSelected}
                          >
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              <Icon size={16} />
                              {method.label}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">{method.description}</span>
                          </button>
                        )
                      })}
                    </div>
                    <button type="button"
                      onClick={() => handlePaymentRequest()}
                      disabled={isCreatingPayment}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Zap size={16} />
                      {isCreatingPayment ? pricingCopy.creatingPayment : pricingCopy.checkout}
                    </button>
                  </div>
                )}

                {paymentSupport ? (
                  <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
                    <p className="font-semibold">{pricingCopy.supportTitle}</p>
                    <p className="mt-1 text-red-800">{paymentSupport.message}</p>
                    <p className="mt-2 text-xs text-red-700">
                      {pricingCopy.supportMethod}: {paymentMethodLabel(paymentSupport.method)}
                    </p>
                    <p className="mt-2 text-xs text-red-700">{pricingCopy.supportBody}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handlePaymentRequest()}
                        disabled={isCreatingPayment}
                        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {isCreatingPayment ? pricingCopy.creatingPayment : pricingCopy.supportRetry}
                      </button>
                      <a
                        href={`mailto:support@kresco.ma?subject=${encodeURIComponent(`Paiement ${paymentSupport.method}`)}`}
                        className="rounded-xl border border-red-300 px-4 py-2 text-center text-sm font-bold text-red-700 transition hover:bg-red-100"
                      >
                        {pricingCopy.supportContact}
                      </a>
                    </div>
                  </div>
                ) : null}

                {pendingRequest ? (
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-50">
                    <p className="font-semibold">{pendingRequest.instructions.title ?? pricingCopy.pendingTitle}</p>
                    <p className="mt-1 text-amber-100/80">{pricingCopy.pendingReference}: {pendingRequest.reference_code}</p>
                    <p className="mt-1 text-amber-100/80">{pricingCopy.pendingAmount}: {(pendingRequest.amount_centimes / 100).toFixed(2)} {pendingRequest.currency}</p>
                    {pendingRequest.instructions.steps?.length ? (
                      <ul className="mt-3 space-y-1 text-xs text-amber-100/80">
                        {pendingRequest.instructions.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    ) : null}
                    <form onSubmit={handleProofSubmit} className="mt-4 space-y-3 text-left">
                      <div>
                        <label htmlFor="manual-proof-reference" className="block text-xs font-semibold text-amber-100">
                          {pricingCopy.proofReference}
                        </label>
                        <input
                          id="manual-proof-reference"
                          value={proofReference}
                          onChange={(event) => setProofReference(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                          placeholder={pricingCopy.proofReferencePlaceholder}
                        />
                      </div>
                      <div>
                        <label htmlFor="manual-proof-payer" className="block text-xs font-semibold text-amber-100">
                          {pricingCopy.proofPayerName}
                        </label>
                        <input
                          id="manual-proof-payer"
                          value={proofPayerName}
                          onChange={(event) => setProofPayerName(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                          placeholder={pricingCopy.proofPayerNamePlaceholder}
                        />
                      </div>
                      <div>
                        <label htmlFor="manual-proof-url" className="block text-xs font-semibold text-amber-100">
                          {pricingCopy.proofUrl}
                        </label>
                        <input
                          id="manual-proof-url"
                          value={proofUrl}
                          onChange={(event) => setProofUrl(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                          placeholder={pricingCopy.proofUrlPlaceholder}
                        />
                      </div>
                      <div>
                        <label htmlFor="manual-proof-notes" className="block text-xs font-semibold text-amber-100">
                          {pricingCopy.proofNotes}
                        </label>
                        <textarea
                          id="manual-proof-notes"
                          value={proofNotes}
                          onChange={(event) => setProofNotes(event.target.value)}
                          className="mt-1 min-h-20 w-full rounded-lg border border-amber-500/30 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                          placeholder={pricingCopy.proofNotesPlaceholder}
                        />
                      </div>
                      {proofSubmitted ? (
                        <p className="text-xs font-semibold text-emerald-300">{pricingCopy.proofSubmittedStatus}</p>
                      ) : null}
                      <button
                        type="submit"
                        disabled={isSubmittingProof || proofSubmitted}
                        className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {isSubmittingProof ? pricingCopy.proofSubmitting : pricingCopy.proofSubmit}
                      </button>
                    </form>
                  </div>
                ) : null}

                <p className="text-slate-400 text-xs text-center mt-4">
                  {pricingCopy.securePayment}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 text-center">
            {[
              { icon: Award, ...pricingCopy.stats[0] },
              { icon: Crown, ...pricingCopy.stats[1] },
              { icon: CheckCircle2, ...pricingCopy.stats[2] },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-sm">
                <Icon size={20} className="text-indigo-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-slate-400 text-sm">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AuthGuard>
  )
}

function paymentMethodLabel(method: PaymentMethod) {
  return pricingCopy.paymentMethods.find((item) => item.value === method)?.label ?? method
}
