export const PRO_CHECKOUT_PLAN = 'pro'
export const PAYMENT_ERROR_MESSAGE = 'Erreur lors de la creation du paiement.'
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'cmi'

export type PaymentMethod = 'cmi' | 'bank_transfer' | 'cashplus' | 'ashplus'

export type PaymentApiClient = {
  get<T = unknown>(url: string, config?: unknown): Promise<{ data: T }>
  post<T = unknown>(url: string, body?: unknown, config?: unknown): Promise<{ data: T }>
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

export async function getCurrentProPaymentRequest(
  apiClient: Pick<PaymentApiClient, 'get'>,
): Promise<PaymentRequest | null> {
  try {
    const { data } = await apiClient.get<PaymentRequest | null>('/payments/payment-requests/current')
    return data ?? null
  } catch {
    return null
  }
}

export function submitProviderPaymentForm(actionUrl: string, formFields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = actionUrl
  form.hidden = true

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
