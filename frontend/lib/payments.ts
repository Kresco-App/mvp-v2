export const PRO_CHECKOUT_PLAN = 'pro'
export const PAYMENT_ERROR_MESSAGE = 'Erreur lors de la creation du paiement.'
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'cmi'

export type PaymentMethod = 'cmi' | 'bank_transfer' | 'cashplus' | 'ashplus'

export type PaymentApiClient = {
  get<T = unknown>(url: string, config?: unknown): Promise<{ data: T }>
  post<T = unknown>(url: string, body?: unknown, config?: unknown): Promise<{ data: T }>
}

export type PaymentVerificationResult =
  | { status: 'success'; userPatch: { is_pro: true } }
  | { status: 'error' }

export type CheckoutSessionResult =
  | { status: 'success'; checkoutUrl: string }
  | { status: 'error'; message: string }

export type CheckoutReturnPaths = {
  successPath?: string
  cancelPath?: string
}

export type PaymentRequest = {
  id: number
  payment_method: PaymentMethod
  status: string
  plan: string
  amount_centimes: number
  currency: string
  reference_code: string
  instructions: PaymentInstructions
  created_at: string
  expires_at: string | null
}

export type PaymentInstructions = {
  title?: string
  action?: string
  action_url?: string
  form_method?: string
  form_fields?: Record<string, string>
  reference_code?: string
  amount_centimes?: number
  currency?: string
  expires_at?: string
  unlock_policy?: string
  steps?: string[]
}

export type PaymentRequestResult =
  | { status: 'provider_redirect'; request: PaymentRequest; actionUrl: string; formFields: Record<string, string> }
  | { status: 'pending_manual_review'; request: PaymentRequest }
  | { status: 'error'; message: string }

export async function verifyCheckoutSession(
  apiClient: Pick<PaymentApiClient, 'get'>,
  sessionId: string | null | undefined,
): Promise<PaymentVerificationResult> {
  const normalizedSessionId = sessionId?.trim()
  if (!normalizedSessionId) return { status: 'error' }
  const idempotencyKey = paymentVerificationIdempotencyKey(normalizedSessionId)

  try {
    const { data } = await apiClient.get<{ is_pro?: boolean }>(
      `/payments/verify-session?session_id=${encodeURIComponent(normalizedSessionId)}`,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    if (data?.is_pro === true) {
      return { status: 'success', userPatch: { is_pro: true } }
    }
  } catch {
    return { status: 'error' }
  }

  return { status: 'error' }
}

export function paymentVerificationIdempotencyKey(sessionId: string) {
  return `verify-${sessionId.trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 153)}`
}

export async function createProCheckoutSession(
  apiClient: Pick<PaymentApiClient, 'post'>,
  returnPaths: CheckoutReturnPaths = {},
): Promise<CheckoutSessionResult> {
  try {
    const { data } = await apiClient.post<{ checkout_url?: string }>(
      '/payments/create-checkout-session',
      {
        plan: PRO_CHECKOUT_PLAN,
        success_path: returnPaths.successPath ?? '/payment-success?session_id={CHECKOUT_SESSION_ID}',
        cancel_path: returnPaths.cancelPath ?? '/pricing',
      },
    )
    const checkoutUrl = data?.checkout_url?.trim()
    if (checkoutUrl) return { status: 'success', checkoutUrl }
  } catch (error) {
    return { status: 'error', message: getPaymentErrorMessage(error) }
  }

  return { status: 'error', message: PAYMENT_ERROR_MESSAGE }
}

export async function createProPaymentRequest(
  apiClient: Pick<PaymentApiClient, 'post'>,
  paymentMethod: PaymentMethod = DEFAULT_PAYMENT_METHOD,
): Promise<PaymentRequestResult> {
  try {
    const { data } = await apiClient.post<PaymentRequest>(
      '/payments/payment-requests',
      {
        plan: PRO_CHECKOUT_PLAN,
        payment_method: paymentMethod,
      },
    )

    if (data.payment_method === 'cmi') {
      const actionUrl = data.instructions.action_url?.trim()
      const formFields = data.instructions.form_fields
      if (actionUrl && formFields && Object.keys(formFields).length > 0) {
        return { status: 'provider_redirect', request: data, actionUrl, formFields }
      }
      return { status: 'error', message: PAYMENT_ERROR_MESSAGE }
    }

    return { status: 'pending_manual_review', request: data }
  } catch (error) {
    return { status: 'error', message: getPaymentErrorMessage(error) }
  }
}

export function submitProviderPaymentForm(actionUrl: string, formFields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = actionUrl
  form.style.display = 'none'

  Object.entries(formFields).forEach(([name, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
}

export function getPaymentErrorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : PAYMENT_ERROR_MESSAGE
}
