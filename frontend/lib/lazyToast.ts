type ToastKind = 'error' | 'info' | 'success'

export const APP_TOASTER_REQUEST_EVENT = 'kresco:app-toaster-request'

type AppToasterWindow = Window & {
  __krescoAppToasterRequested?: boolean
}

let toastModulePromise: Promise<typeof import('sonner')> | null = null

function loadToastModule() {
  toastModulePromise ??= import('sonner')
  return toastModulePromise
}

export function requestAppToaster() {
  if (typeof window === 'undefined') return
  const toasterWindow = window as AppToasterWindow
  toasterWindow.__krescoAppToasterRequested = true
  window.dispatchEvent(new Event(APP_TOASTER_REQUEST_EVENT))
}

export function isAppToasterRequested() {
  return typeof window !== 'undefined' && Boolean((window as AppToasterWindow).__krescoAppToasterRequested)
}

export async function showToast(kind: ToastKind, message: string) {
  requestAppToaster()
  const { toast } = await loadToastModule()
  toast[kind](message)
}

export function showToastError(message: string) {
  void showToast('error', message)
}

export function showToastInfo(message: string) {
  void showToast('info', message)
}

export function showToastSuccess(message: string) {
  void showToast('success', message)
}
