import type { PaymentMethod } from '@/lib/payments'

export type ManualPaymentApiClient = {
  post<T = unknown, Body = unknown>(url: string, body?: Body, config?: unknown): Promise<{ data: T }>
}

export type ManualPaymentProofInput = {
  proof_kind?: string
  provider_reference?: string
  proof_url?: string
  payer_name?: string
  notes?: string
}

export type ManualPaymentTransaction = {
  id: number
  payment_method: PaymentMethod
  status: string
  reference_code: string
  provider_reference?: string | null
  metadata?: Record<string, unknown>
}

export type ManualPaymentProofResult =
  | { status: 'success'; transaction: ManualPaymentTransaction }
  | { status: 'error'; message: string }

export const MANUAL_PAYMENT_PROOF_ERROR = 'Erreur lors de l envoi du justificatif.'

export async function submitManualPaymentProof(
  apiClient: Pick<ManualPaymentApiClient, 'post'>,
  transactionId: number,
  proof: ManualPaymentProofInput,
): Promise<ManualPaymentProofResult> {
  try {
    const { data } = await apiClient.post<ManualPaymentTransaction>(
      `/payments/manual-payment-requests/${transactionId}/proof`,
      {
        proof_kind: proof.proof_kind ?? 'receipt',
        provider_reference: normalizeOptionalText(proof.provider_reference),
        proof_url: normalizeOptionalText(proof.proof_url),
        payer_name: normalizeOptionalText(proof.payer_name),
        notes: normalizeOptionalText(proof.notes),
      },
    )
    return { status: 'success', transaction: data }
  } catch (error) {
    return { status: 'error', message: getManualPaymentProofErrorMessage(error) }
  }
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

export function getManualPaymentProofErrorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : MANUAL_PAYMENT_PROOF_ERROR
}
