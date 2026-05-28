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

  it('ignores cached stream data from a previous lesson id', () => {
    const data = { otp: 'same-otp', playback_info: 'same-playback' }

    expect(resolveLessonStreamData({ lessonId: 'lesson-a', data }, 'lesson-a')).toBe(data)
    expect(resolveLessonStreamData({ lessonId: 'lesson-a', data }, 'lesson-b')).toBeNull()
  })

  it('treats progress writes as lesson-bound identity checks', () => {
    expect(isActiveLesson(42, 42)).toBe(true)
    expect(isActiveLesson(42, 7)).toBe(false)
  })
})
