import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PROFILE_AVATAR_URL,
  DEFAULT_PROFILE_BANNER_URL,
  buildProfileBadgeItems,
  buildProfileNoteHubItems,
  buildProfileSaveHubItems,
  buildEditDraft,
  canonicalSubject,
  clampScore,
  formatProfileBadgeStatus,
  formatProfileHubDate,
  formatWatchTime,
  getFollowers,
  getJoinedDate,
  getLeagueLabel,
  getUsername,
  mediaUrl,
  normalizeProfileSaveTags,
  normalizeSubjects,
  profileBadgeSummary,
  profileNoteHref,
  profileSavedItemHref,
  profileTargetLabel,
  profileTopicDeepLink,
  ringPoints,
  scoreCaption,
  scoreTone,
  toProfileSubject,
} from '@/lib/profileViewModel'

describe('profile view model helpers', () => {
  it('normalizes and scores subjects for the radar view', () => {
    expect(canonicalSubject('Physique Chimie')).toEqual({ key: 'physics', title: 'Physique-Chimie' })
    expect(toProfileSubject('Chimie', 92.4, 0)).toMatchObject({
      key: 'chemistry',
      title: 'Chimie',
      score: 92,
      caption: 'Oh my god, are you Mendeleev',
      tone: '#009966',
    })
    expect(clampScore(140)).toBe(100)
    expect(clampScore(-4)).toBe(0)
  })

  it('deduplicates provided subjects and falls back when empty', () => {
    const subjects = normalizeSubjects([
      { key: 'math', title: 'Math A', score: 10, caption: 'first', tone: '#111' },
      { key: 'math', title: 'Math B', score: 20, caption: 'second', tone: '#222' },
    ])

    expect(subjects).toHaveLength(1)
    expect(subjects[0].title).toBe('Math B')
    expect(normalizeSubjects([]).map((subject) => subject.key)).toEqual(['math', 'physics', 'chemistry', 'geography', 'biology', 'philosophy'])
  })

  it('formats profile identity and progress labels defensively', () => {
    expect(getUsername(null)).toBe('ahmedmalik547')
    expect(getUsername({ email: 'student+demo@example.com' })).toBe('studentdemo')
    expect(getJoinedDate('2025-03-15T00:00:00Z')).toBe('Joined March 2025')
    expect(getJoinedDate('not-a-date')).toBe('Joined July 2026')
    expect(formatWatchTime(44.4)).toBe('44m')
    expect(formatWatchTime(125)).toBe('2h 5m')
    expect(formatWatchTime(-1)).toBe('0m')
  })

  it('builds edit drafts and media URLs from centralized config', () => {
    expect(buildEditDraft(null, null)).toMatchObject({
      full_name: 'Ahmed Malik',
      avatar_url: DEFAULT_PROFILE_AVATAR_URL,
      banner_url: DEFAULT_PROFILE_BANNER_URL,
    })
    expect(mediaUrl('/media/avatar.png')).toBe('/media/avatar.png')
    expect(mediaUrl('/figma-assets/profile/profile-avatar.png')).toBe('/figma-assets/profile/profile-avatar.png')
    expect(mediaUrl('https://cdn.kresco.ma/avatar.png')).toBe('https://cdn.kresco.ma/avatar.png')
  })

  it('derives league and follower lists from leaderboard entries', () => {
    expect(getLeagueLabel(12)).toBe('Emerald IV')
    expect(getLeagueLabel(2, [{ rank: 1, user_id: 10, full_name: 'Current', total_xp: 1000, is_current_user: true }])).toBe('Bronze I')

    const followers = getFollowers([
      { rank: 1, user_id: 1, full_name: 'Current', total_xp: 1000, is_current_user: true },
      { rank: 2, user_id: 2, full_name: 'Peer', total_xp: 900 },
    ])

    expect(followers).toHaveLength(1)
    expect(followers[0].full_name).toBe('Peer')
    expect(followers[0].avatar_url).toContain('/figma-assets/profile/follower-fatima.png')
  })

  it('keeps radar geometry stable', () => {
    expect(ringPoints(100, 50, 4)).toBe('100,50 150,100 100,150 50,100')
    expect(scoreTone(40, 0)).toBe('#ff6467')
    expect(scoreTone(55, 0)).toBe('#ff8904')
    expect(scoreCaption('math', 88)).toBe('Strong progress, keep the rhythm')
  })

  it('builds profile badge display state from inventory and fallback progress', () => {
    const inventory = {
      earned_count: 2,
      total_count: 3,
      badges: [
        { slug: 'xp_100', title: '100 XP', description: 'Reach 100 XP', category: 'xp', rarity: 'common', earned: true, earned_at: '2026-05-26T10:00:00Z' },
        { slug: 'xp_500', title: '500 XP', description: 'Reach 500 XP', category: 'xp', rarity: 'rare', earned: false },
        { slug: 'streak_7', title: 'Weekly streak', description: 'Keep a weekly streak', category: 'streak', rarity: 'rare', earned: true },
      ],
    }

    const badges = buildProfileBadgeItems(inventory, null, null, 3)
    expect(badges.map((badge) => badge.slug)).toEqual(['xp_100', 'streak_7', 'xp_500'])
    expect(profileBadgeSummary(inventory, badges)).toEqual({ earnedCount: 2, totalCount: 3 })
    expect(formatProfileBadgeStatus(badges[0])).toBe('Earned May 26')
    expect(formatProfileBadgeStatus(badges[1])).toBe('Earned')
    expect(formatProfileBadgeStatus(badges[2])).toBe('Reach 500 XP')

    const fallback = buildProfileBadgeItems(
      null,
      { total_xp: 550, level: 4, streak_days: 2 },
      { totalWatchMinutes: 90, quizzesPassed: 1, itemsCompleted: 1, isPro: true },
      6,
    )
    expect(fallback.find((badge) => badge.slug === 'xp_500')?.earned).toBe(true)
    expect(fallback.find((badge) => badge.slug === 'streak_7')?.earned).toBe(false)
    expect(fallback.find((badge) => badge.slug === 'first_mistake_corrected')?.earned).toBe(true)
  })

  it('builds profile note hub links and date labels', () => {
    const items = buildProfileNoteHubItems([
      { id: 1, topic_id: 12, topic_item_id: 34, tab_content_id: 8, body: 'Study this', updated_at: '2026-05-26T10:00:00Z' },
      { id: 2, body: 'Missing context' },
    ], 2)

    expect(items).toEqual([
      { id: 'note-1', href: '/topics/12?item=34&tab=8', title: 'Study this', meta: 'May 26' },
      { id: 'note-2', href: '/profile', title: 'Missing context', meta: 'Recent' },
    ])
    expect(profileNoteHref({ id: 3, topic_id: 12, body: 'Topic note', tab_content_id: 8 })).toBe('/topics/12?tab=8')
    expect(formatProfileHubDate('not-a-date')).toBe('Recent')
  })

  it('builds target-aware saved item links for the profile hub', () => {
    expect(profileTopicDeepLink(12, 34)).toBe('/topics/12?item=34')
    expect(profileSavedItemHref({ id: 1, target_type: 'topic_item', target_id: 34, topic_id: 12, topic_item_id: 34 })).toBe('/topics/12?item=34')
    expect(profileSavedItemHref({ id: 2, target_type: 'resource', target_id: 9, topic_id: 12, topic_item_id: 34 })).toBe('/topics/12?item=34&resource=9')
    expect(profileSavedItemHref({ id: 3, target_type: 'quiz', target_id: 7, topic_id: 12, topic_item_id: 34 })).toBe('/topics/12?item=34&quiz=7')
    expect(profileSavedItemHref({ id: 4, target_type: 'tab_content', target_id: 8, topic_id: 12, topic_item_id: 34 })).toBe('/topics/12?item=34&tab=8')
    expect(profileSavedItemHref({ id: 5, target_type: 'exam_problem', target_id: 99, topic_id: 12 })).toBe('/exam-bank?problem=99&topic=12')
    expect(profileSavedItemHref({ id: 6, target_type: 'lesson', target_id: 101 })).toBe('/profile')
    expect(profileSavedItemHref({ id: 7, target_type: 'chapter', target_id: 3 })).toBe('/profile')
  })

  it('builds saved item hub display labels defensively', () => {
    const items = buildProfileSaveHubItems([
      {
        id: 1,
        target_type: 'exam_problem',
        target_id: 99,
        label: ' Bac 2024 Problem ',
        note: 'Review the energy balance before the final sprint.',
        tags: [' Bac ', 'bac', 'Energy transfer', 'Long tag name that should be clipped after thirty two chars'],
        created_at: '2026-06-01T10:00:00Z',
      },
      { id: 2, target_type: 'topic_item', target_id: 34, topic_id: 12, topic_item_id: 34 },
    ], 2)

    expect(items).toEqual([
      {
        id: 'save-1',
        href: '/exam-bank?problem=99',
        title: 'Bac 2024 Problem',
        meta: 'Exam problem - Jun 1',
        detail: 'Review the energy balance before the final sprint.',
        tags: ['Bac', 'Energy transfer', 'Long tag name that should be cli'],
      },
      { id: 'save-2', href: '/topics/12?item=34', title: 'Lesson #34', meta: 'Lesson' },
    ])
    expect(profileTargetLabel('tab_content')).toBe('Lesson section')
    expect(profileTargetLabel('')).toBe('Saved item')
    expect(normalizeProfileSaveTags(['  Exam prep  ', 'exam prep', '', ' Physics '])).toEqual(['Exam prep', 'Physics'])
  })
})
