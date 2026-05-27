import { describe, expect, it } from 'vitest'

import {
  LOCAL_DEMO_VIDEO_OTP,
  isLocalDemoHost,
  isLocalDemoVideoEnabled,
  isLocalDemoVideoStream,
} from '@/lib/devFeatures'

describe('development feature boundaries', () => {
  it('identifies local-only demo media hosts', () => {
    expect(isLocalDemoHost('localhost')).toBe(true)
    expect(isLocalDemoHost('127.0.0.1')).toBe(true)
    expect(isLocalDemoHost('[::1]')).toBe(true)
    expect(isLocalDemoHost('preview.ngrok-free.dev')).toBe(true)
  })

  it('rejects production-like hosts for local-only demo media', () => {
    expect(isLocalDemoHost('kresco.ma')).toBe(false)
    expect(isLocalDemoHost('api.kresco.ma')).toBe(false)
  })

  it('allows mock video streams only on local demo hosts', () => {
    expect(isLocalDemoVideoStream({ otp: LOCAL_DEMO_VIDEO_OTP }, new URL('http://localhost:3000'))).toBe(true)
    expect(isLocalDemoVideoStream({ otp: LOCAL_DEMO_VIDEO_OTP }, new URL('https://preview.ngrok-free.dev'))).toBe(true)
    expect(isLocalDemoVideoStream({ otp: LOCAL_DEMO_VIDEO_OTP }, new URL('https://app.kresco.ma'))).toBe(false)
    expect(isLocalDemoVideoStream({ otp: 'real-otp' }, new URL('http://localhost:3000'))).toBe(false)
  })

  it('disables local demo video streams in production builds regardless of host or mock OTP', () => {
    const productionEnv = { NODE_ENV: 'production', NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO: undefined }

    expect(isLocalDemoVideoEnabled(productionEnv)).toBe(false)
    expect(isLocalDemoVideoStream(
      { otp: LOCAL_DEMO_VIDEO_OTP },
      new URL('http://localhost:3000'),
      productionEnv,
    )).toBe(false)
  })

  it('allows explicit local development opt-out', () => {
    expect(isLocalDemoVideoEnabled({
      NODE_ENV: 'development',
      NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO: 'false',
    })).toBe(false)
  })
})
