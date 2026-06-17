import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildVdoCipherIframeSrc,
  isActiveLesson,
  resolveLessonStreamData,
} from '@/components/VideoPlayer'

describe('VideoPlayer VdoCipher URL construction', () => {
  it('URI-encodes VdoCipher credentials before placing them in the iframe URL', () => {
    const url = buildVdoCipherIframeSrc({
      otp: 'otp with spaces & symbols=1',
      playback_info: 'playback/info+with?query&x=1',
    })

    expect(url).toBe(
      'https://player.vdocipher.com/v2/?otp=otp%20with%20spaces%20%26%20symbols%3D1&playbackInfo=playback%2Finfo%2Bwith%3Fquery%26x%3D1&player=&',
    )
  })

  it('ignores cached stream data from a previous topic item id', () => {
    const data = { otp: 'same-otp', playback_info: 'same-playback' }

    expect(resolveLessonStreamData({ topicItemId: 'item-a', data }, 'item-a')).toBe(data)
    expect(resolveLessonStreamData({ topicItemId: 'item-a', data }, 'item-b')).toBeNull()
  })

  it('treats progress writes as item-bound identity checks', () => {
    expect(isActiveLesson(42, 42)).toBe(true)
    expect(isActiveLesson(42, 7)).toBe(false)
  })

  it('renders stream errors before the no-stream loading fallback', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'VideoPlayer.tsx'), 'utf8')

    expect(source.indexOf('if (error)')).toBeGreaterThan(-1)
    expect(source.indexOf('if (error)')).toBeLessThan(source.indexOf('if (loading || !streamData)'))
  })

  it('does not bundle a local demo video fallback into the production player', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'VideoPlayer.tsx'), 'utf8')

    expect(source).not.toContain('devFeatures')
    expect(source).not.toContain('isLocalDemoVideoStream')
    expect(source).not.toContain('mock-otp-token')
    expect(source).not.toContain('Apercu video local')
  })
})
