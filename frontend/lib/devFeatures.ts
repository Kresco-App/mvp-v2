const LOCAL_DEMO_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])
const LOCAL_DEMO_HOST_SUFFIXES = ['.ngrok-free.dev']

export const LOCAL_DEMO_VIDEO_OTP = 'mock-otp-token'
type DemoFeatureEnv = {
  NODE_ENV?: string
  NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO?: string
}

function normalizeHostname(hostname?: string | null) {
  return (hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
}

export function isLocalDemoHost(hostname?: string | null) {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return false
  if (LOCAL_DEMO_HOSTNAMES.has(normalized)) return true
  return LOCAL_DEMO_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function isLocalDemoVideoEnabled(env: DemoFeatureEnv = process.env as DemoFeatureEnv) {
  if (env.NODE_ENV === 'production') return false
  return env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO !== 'false'
}

export function isLocalDemoVideoStream(
  streamData?: { otp?: string | null } | null,
  location: Pick<Location, 'hostname'> | URL | null = typeof window === 'undefined' ? null : window.location,
  env: DemoFeatureEnv = process.env as DemoFeatureEnv,
) {
  if (!isLocalDemoVideoEnabled(env)) return false
  return streamData?.otp === LOCAL_DEMO_VIDEO_OTP && isLocalDemoHost(location?.hostname)
}
