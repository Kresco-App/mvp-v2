export const PRO_CHECKOUT_PLAN = 'pro'
export const PAYMENT_ERROR_MESSAGE = 'Erreur lors de la creation du paiement.'

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

export function getPaymentErrorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : PAYMENT_ERROR_MESSAGE
}
