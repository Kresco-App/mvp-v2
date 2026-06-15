'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Crown, Zap, BookOpen, Award, ArrowLeft, CreditCard, Landmark, Store, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { apiJsonClient } from '@/lib/apiClient'
import { localizedCopy } from '@/lib/localization'
import {
  DEFAULT_PAYMENT_METHOD,
  createProPaymentRequest,
  submitProviderPaymentForm,
  type PaymentMethod,
  type PaymentRequest,
} from '@/lib/payments'
import AuthGuard from '@/components/AuthGuard'

const pricingCopy = localizedCopy.pricing
const paymentMethodIcons: Record<PaymentMethod, typeof CreditCard> = {
  cmi: CreditCard,
  bank_transfer: Landmark,
  cashplus: Store,
  ashplus: Receipt,
}

export default function PricingPage() {
  const user = useAuthStore((state) => state.user)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD)
  const [pendingRequest, setPendingRequest] = useState<PaymentRequest | null>(null)
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)

  async function handlePaymentRequest() {
    setIsCreatingPayment(true)
    const result = await createProPaymentRequest(apiJsonClient, selectedPaymentMethod)
    setIsCreatingPayment(false)

    if (result.status === 'provider_redirect') {
      submitProviderPaymentForm(result.actionUrl, result.formFields)
      return
    }

    if (result.status === 'pending_manual_review') {
      setPendingRequest(result.request)
      toast.success(pricingCopy.pendingToast)
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
                              setSelectedPaymentMethod(method.value)
                              setPendingRequest(null)
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
