import { describe, expect, it } from 'vitest'

import {
  buildPermanentSidebarCalendarDays,
  buildStrikeDays,
  getCalendarDayKey,
  getCalendarStart,
  getCalendarWindow,
  getLeaderboardAvatarSrc,
  getQuestProgressPercent,
  getQuestTone,
  normalizeQuests,
  permanentSidebarCountdownDefaults,
  permanentSidebarDefaultSections,
  toClientSidebarData,
  wrapIndex,
} from '@/lib/permanentSidebarViewModel'

describe('permanent sidebar view model', () => {
  it('normalizes snake_case API payloads into client sidebar data', () => {
    const data = toClientSidebarData({
      chrono_units: [{ value: 1, label: 'Day' }],
      calendar_days: [{ id: 'today', value: 26, label: 'Tue' }],
      live_events: [{ id: 'live-1', title: 'Physics', subject: 'Waves' }],
      strike_days: [{ label: 'Mon', done: true }],
      quests: [{ id: 'q1', title: 'Finish the waves recap', progress: 1, target: 2 }],
      leaderboard_entries: [{ rank: 1, user_id: 1, full_name: 'A', total_xp: 100 }],
    })

    expect(data.chronoUnits).toEqual([{ value: 1, label: 'Day' }])
    expect(data.calendarDays?.[0].id).toBe('today')
    expect(data.liveEvents?.[0].subject).toBe('Waves')
    expect(data.strikeDays?.[0].done).toBe(true)
    expect(data.quests?.[0].title).toBe('Finish the waves recap')
    expect(data.leaderboardEntries?.[0].total_xp).toBe(100)
  })

  it('falls back only for missing sidebar data sections', () => {
    const data = toClientSidebarData({})

    expect(data.chronoUnits).toBe(permanentSidebarCountdownDefaults)
    expect(data.quests).toEqual([])
    expect(permanentSidebarDefaultSections).toEqual(['chrono', 'calendar', 'strike', 'quests', 'leaderboard'])
  })

  it('builds stable calendar windows and date keys', () => {
    const days = buildPermanentSidebarCalendarDays(new Date(2026, 4, 26, 12))
    const activeIndex = days.findIndex((day) => day.active)
    const start = getCalendarStart(activeIndex, days.length, 5)
    const windowDays = getCalendarWindow(days, start, 5)

    expect(days).toHaveLength(21)
    expect(days[0]).toMatchObject({ id: '2026-05-19', label: 'Tue' })
    expect(days[7]).toMatchObject({ id: '2026-05-26', active: true })
    expect(windowDays.map(getCalendarDayKey)).toEqual([
      '2026-05-24-Sun',
      '2026-05-25-Mon',
      '2026-05-26-Tue',
      '2026-05-27-Wed',
      '2026-05-28-Thu',
    ])
    expect(wrapIndex(-1, days.length)).toBe(20)
  })

  it('normalizes quests without replacing live API titles', () => {
    const quests = normalizeQuests([
      { id: 'custom', title: 'Original', progress: 12, target: 10 },
      { id: 'blank', title: '   ', progress: 0, target: 1 },
    ])

    expect(quests[0].title).toBe('Original')
    expect(quests[1].title).toBe('Score 14/20 or higher in 2 exercises')
    expect(normalizeQuests([])).toEqual([])
  })

  it('normalizes quest progress, tones, and strike streaks defensively', () => {
    const quests = normalizeQuests([{ id: 'custom', title: 'Original', progress: 12, target: 10 }])
    const strikeDays = buildStrikeDays(3, new Date(2026, 4, 28))

    expect(quests[0].title).toBe('Original')
    expect(getQuestProgressPercent(quests[0])).toBe(100)
    expect(getQuestProgressPercent({ progress: -10, target: 0 })).toBe(0)
    expect(getQuestTone('quiz', 1, 'home')).toBe('#5c5bff')
    expect(getQuestTone('quiz', 1, 'sidebar')).toBe('#5b60f9')
    expect(strikeDays.map((day) => day.done)).toEqual([false, true, true, true, false, false, false])
  })

  it('centralizes leaderboard avatar fallbacks', () => {
    const entry = { avatar_url: '' }

    expect(getLeaderboardAvatarSrc({ avatar_url: 'https://cdn/avatar.png' }, 0)).toBe('https://cdn/avatar.png')
    expect(getLeaderboardAvatarSrc(entry, 1)).toBe('/figma-assets/sidebar-avatar-fatima.png')
    expect(getLeaderboardAvatarSrc(entry, 2)).toBe('/figma-assets/sidebar-avatar-ahmed.png')
  })
})
