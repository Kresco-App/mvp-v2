'use client'

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { BookCheck, Camera, ChevronRight, Clock3, Flame, Loader2, Pencil, Save, ShieldCheck, Star, Trophy, X, Zap } from 'lucide-react'
import { getLeagueInfoByKey, rankToLeagueKey } from '@/lib/leaderboardLeagues'
import {
  CalendarCard,
  ChronoCard,
  type PermanentSidebarCalendarDay,
  type PermanentSidebarCountdownUnit,
  type PermanentSidebarLeaderboardEntry,
  type PermanentSidebarLiveEvent,
} from './permanent-sidebar'

export type FigmaProfileUser = {
  full_name?: string
  email?: string
  avatar_url?: string
  banner_url?: string
  niveau?: string
  filiere?: string
  track?: string
  created_at?: string
}

export type FigmaProfileXP = {
  total_xp: number
  level: number
  xp_progress_pct?: number
  xp_for_current_level?: number
  xp_for_next_level?: number
  streak_days: number
}

export type FigmaProfileStats = {
  totalWatchMinutes: number
  quizzesPassed: number
  lessonsCompleted: number
  isPro: boolean
}

export type FigmaProfileSubject = {
  key: string
  title: string
  score: number
  caption: string
  tone: string
}

export type FigmaProfileSidebarData = {
  chronoUnits?: PermanentSidebarCountdownUnit[]
  calendarDays?: PermanentSidebarCalendarDay[]
  liveEvents?: PermanentSidebarLiveEvent[]
  leaderboardEntries?: PermanentSidebarLeaderboardEntry[]
}

export type FigmaProfileMediaKind = 'avatar' | 'banner'

export type FigmaProfileEditDraft = {
  full_name: string
  level?: string
  track?: string
  avatar_url?: string
  banner_url?: string
}

export type FigmaProfileProps = {
  user: FigmaProfileUser | null
  xp: FigmaProfileXP | null
  stats?: FigmaProfileStats | null
  subjects: FigmaProfileSubject[]
  sidebar: FigmaProfileSidebarData
  loading?: boolean
  editable?: boolean
  saving?: boolean
  editError?: string | null
  onSaveProfile?: (draft: FigmaProfileEditDraft) => void | Promise<void>
  onSelectMedia?: (kind: FigmaProfileMediaKind, draft: FigmaProfileEditDraft) => string | undefined | Promise<string | undefined>
}

const fallbackSubjects: FigmaProfileSubject[] = [
  { key: 'math', title: 'Mathematics', score: 56, caption: "You're doing good keep it up", tone: '#ff8904' },
  { key: 'physics', title: 'Physics', score: 32, caption: 'Almost there, just a little more effort', tone: '#ff6467' },
  { key: 'chemistry', title: 'Chemistry', score: 93, caption: 'Oh my god, are you Mendeleev', tone: '#009966' },
  { key: 'geography', title: 'Geography', score: 64, caption: 'Cool, you know your continents!', tone: '#009966' },
  { key: 'biology', title: 'Biology', score: 80, caption: 'Cells, genetics, and steady wins', tone: '#453dee' },
  { key: 'philosophy', title: 'Philosophy', score: 72, caption: 'Clear arguments are paying off', tone: '#707fff' },
  { key: 'english', title: 'English', score: 68, caption: 'Vocabulary and writing are growing', tone: '#51a2ff' },
]

const badgeTones = ['#5b60f9', '#c4d1ff', '#51a2ff', '#ff8904']
const defaultBannerUrl = '/figma-assets/profile/profile-cover.png'
const defaultAvatarUrl = '/figma-assets/profile/profile-avatar.png'

export function FigmaProfile({
  user,
  xp,
  stats,
  subjects,
  sidebar,
  loading,
  editable = true,
  saving,
  editError,
  onSaveProfile,
  onSelectMedia,
}: FigmaProfileProps) {
  const visibleSubjects = useMemo(() => normalizeSubjects(subjects), [subjects])
  const [editing, setEditing] = useState(false)
  const [localSaving, setLocalSaving] = useState(false)
  const [selectingMedia, setSelectingMedia] = useState<FigmaProfileMediaKind | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [optimisticDraft, setOptimisticDraft] = useState<FigmaProfileEditDraft | null>(null)
  const baseDraft = useMemo(() => buildEditDraft(user, xp), [user, xp])
  const [draft, setDraft] = useState<FigmaProfileEditDraft>(baseDraft)
  const firstName = optimisticDraft?.full_name || user?.full_name || 'Ahmed Malik'
  const username = getUsername(user)
  const joined = getJoinedDate(user?.created_at)
  const totalXp = xp?.total_xp ?? 541135
  const streak = xp?.streak_days ?? 7
  const league = getLeagueLabel(xp?.level, sidebar.leaderboardEntries)
  const watchTime = formatWatchTime(stats?.totalWatchMinutes ?? 0)
  const completedLessons = stats?.lessonsCompleted ?? 0
  const quizzesPassed = stats?.quizzesPassed ?? 0
  const followers = getFollowers(sidebar.leaderboardEntries)
  const avatarUrl = mediaUrl(optimisticDraft?.avatar_url || user?.avatar_url || defaultAvatarUrl)
  const bannerUrl = mediaUrl(optimisticDraft?.banner_url || user?.banner_url || defaultBannerUrl)
  const isSaving = Boolean(saving || localSaving)
  const isMediaSelecting = Boolean(selectingMedia)
  const visibleError = editError || localError
  const titleId = useId()

  useEffect(() => {
    setOptimisticDraft(null)
    setDraft(baseDraft)
  }, [baseDraft])

  useEffect(() => {
    if (!editing) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving && !isMediaSelecting) {
        setEditing(false)
        setLocalError(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editing, isSaving, isMediaSelecting])

  function openEditor() {
    setDraft(optimisticDraft ?? baseDraft)
    setLocalError(null)
    setEditing(true)
  }

  function closeEditor() {
    if (isSaving || isMediaSelecting) return
    setEditing(false)
    setLocalError(null)
  }

  async function handleMediaSelect(kind: FigmaProfileMediaKind) {
    if (!onSelectMedia) return
    setSelectingMedia(kind)
    setLocalError(null)
    try {
      const selectedUrl = await onSelectMedia(kind, draft)
      if (!selectedUrl) return
      setDraft((current) => ({
        ...current,
        [kind === 'avatar' ? 'avatar_url' : 'banner_url']: selectedUrl,
      }))
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not select media.')
    } finally {
      setSelectingMedia(null)
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = draft.full_name.trim()
    if (!trimmedName) {
      setLocalError('Display name is required.')
      return
    }

    const nextDraft = { ...draft, full_name: trimmedName }
    setLocalSaving(true)
    setLocalError(null)

    try {
      await onSaveProfile?.(nextDraft)
      setOptimisticDraft(nextDraft)
      setEditing(false)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not save profile changes.')
    } finally {
      setLocalSaving(false)
    }
  }

  return (
    <div className="figma-profile-page">
      <ProfileEditStyles />
      <div className="figma-profile-shell">
        <main className="figma-profile-main" aria-busy={loading ? 'true' : 'false'}>
          <section className="figma-profile-hero" aria-label="Profile summary">
            <div className="figma-profile-cover">
              <img src={bannerUrl} alt="" />
            </div>
            <div className="figma-profile-avatar" aria-label="Profile picture">
              <img src={avatarUrl} alt={firstName} referrerPolicy="no-referrer" />
            </div>

            <div className="figma-profile-badges" aria-label="Badges">
              {badgeTones.map((tone) => (
                <span key={tone} className="figma-profile-badge" style={{ backgroundColor: tone }}>
                  <Star size={13} fill="#ffffff" strokeWidth={2.4} />
                  <i />
                </span>
              ))}
            </div>

            <div className="figma-profile-identity">
              <h1>{firstName}</h1>
              <p>{username}</p>
              <span>{joined}</span>
            </div>

            {editable ? (
              <button type="button" className="figma-profile-edit-trigger" onClick={openEditor} disabled={loading || isSaving} aria-haspopup="dialog">
                <Pencil size={15} strokeWidth={2.5} />
                Edit profile
              </button>
            ) : null}
          </section>

          <section className="figma-profile-stats" aria-label="Learning stats">
            <ProfileStatCard icon="flame" value={streak.toLocaleString()} label="Day streak" tone="#ff8904" />
            <ProfileStatCard icon="bolt" value={totalXp.toLocaleString()} label="EXP points" tone="#ffd61a" />
            <ProfileStatCard icon="league" value={league} label="Current League" tone="#707fff" />
            <ProfileStatCard icon="watch" value={watchTime} label="Watch time" tone="#51a2ff" />
            <ProfileStatCard icon="complete" value={completedLessons.toLocaleString()} label="Completed lessons" tone="#009966" />
            <ProfileStatCard icon="quiz" value={quizzesPassed.toLocaleString()} label="Passed quizzes" tone="#5b60f9" />
          </section>

          <section className="figma-profile-subjects" aria-label="Subject progress">
            <SubjectRadar subjects={visibleSubjects.slice(0, 6)} />
            {visibleSubjects.map((subject) => (
              <SubjectScoreCard subject={subject} key={subject.key} />
            ))}
          </section>
        </main>

        <aside className="figma-profile-rail" aria-label="Profile sidebar">
          <ChronoCard units={sidebar.chronoUnits} />
          <CalendarCard days={sidebar.calendarDays} events={sidebar.liveEvents} />
          <FollowerPanel entries={followers} />
        </aside>
      </div>

      {editing ? (
        <div className="figma-profile-edit-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isMediaSelecting) closeEditor()
        }}>
          <form className="figma-profile-edit-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={handleSave}>
            <div className="figma-profile-edit-head">
              <div>
                <h2 id={titleId}>Edit profile</h2>
                <p>Update how your profile appears to classmates.</p>
              </div>
              <button type="button" className="figma-profile-icon-button" onClick={closeEditor} disabled={isSaving || isMediaSelecting} aria-label="Close profile editor">
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>

            <div className="figma-profile-edit-preview">
              <img className="figma-profile-edit-cover" src={mediaUrl(draft.banner_url || defaultBannerUrl)} alt="" />
              <img className="figma-profile-edit-avatar" src={mediaUrl(draft.avatar_url || defaultAvatarUrl)} alt="" referrerPolicy="no-referrer" />
            </div>

            <div className="figma-profile-edit-grid">
              <label className="figma-profile-edit-field">
                <span>Display name</span>
                <input
                  className="figma-input"
                  value={draft.full_name}
                  onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))}
                  autoComplete="name"
                  disabled={isSaving || isMediaSelecting}
                  required
                />
              </label>

              <label className="figma-profile-edit-field">
                <span>Level</span>
                <input
                  className="figma-input"
                  value={draft.level ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value }))}
                  placeholder="2bac"
                  disabled={isSaving || isMediaSelecting}
                />
              </label>

              <label className="figma-profile-edit-field">
                <span>Track</span>
                <input
                  className="figma-input"
                  value={draft.track ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, track: event.target.value }))}
                  placeholder="Sciences Math"
                  disabled={isSaving || isMediaSelecting}
                />
              </label>

              <label className="figma-profile-edit-field figma-profile-edit-field-wide">
                <span>Avatar image URL</span>
                <div className="figma-profile-media-row">
                  <input
                    className="figma-input"
                    value={draft.avatar_url ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, avatar_url: event.target.value }))}
                    placeholder={defaultAvatarUrl}
                    disabled={isSaving || isMediaSelecting}
                  />
                  <button type="button" className="figma-profile-media-button" onClick={() => handleMediaSelect('avatar')} disabled={isSaving || isMediaSelecting || !onSelectMedia}>
                    {selectingMedia === 'avatar' ? <Loader2 className="figma-profile-spin" size={15} /> : <Camera size={15} strokeWidth={2.5} />}
                    {selectingMedia === 'avatar' ? 'Choosing' : 'Choose'}
                  </button>
                </div>
              </label>

              <label className="figma-profile-edit-field figma-profile-edit-field-wide">
                <span>Banner image URL</span>
                <div className="figma-profile-media-row">
                  <input
                    className="figma-input"
                    value={draft.banner_url ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, banner_url: event.target.value }))}
                    placeholder={defaultBannerUrl}
                    disabled={isSaving || isMediaSelecting}
                  />
                  <button type="button" className="figma-profile-media-button" onClick={() => handleMediaSelect('banner')} disabled={isSaving || isMediaSelecting || !onSelectMedia}>
                    {selectingMedia === 'banner' ? <Loader2 className="figma-profile-spin" size={15} /> : <Camera size={15} strokeWidth={2.5} />}
                    {selectingMedia === 'banner' ? 'Choosing' : 'Choose'}
                  </button>
                </div>
              </label>
            </div>

            {visibleError ? (
              <p className="figma-profile-edit-error" role="alert">
                {visibleError}
              </p>
            ) : null}

            <div className="figma-profile-edit-actions">
              <button type="button" className="figma-button secondary" onClick={closeEditor} disabled={isSaving || isMediaSelecting}>
                Cancel
              </button>
              <button type="submit" className="figma-button" disabled={isSaving || isMediaSelecting}>
                {isSaving ? <Loader2 className="figma-profile-spin" size={15} /> : <Save size={15} />}
                {isSaving ? 'Saving' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function ProfileEditStyles() {
  return (
    <style>{`
      .figma-profile-edit-trigger {
        position: absolute;
        right: 8px;
        top: 162px;
        z-index: 2;
        display: inline-flex;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 2px solid rgba(255,255,255,0.72);
        border-radius: 12px;
        background: rgba(255,255,255,0.94);
        color: #3f3f46;
        padding: 0 13px;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0;
        box-shadow: 0 10px 24px rgba(24,24,27,0.14);
        cursor: pointer;
      }

      .figma-profile-edit-trigger:disabled,
      .figma-profile-icon-button:disabled,
      .figma-profile-media-button:disabled,
      .figma-profile-edit-actions button:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }

      .figma-profile-edit-layer {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: grid;
        place-items: center;
        overflow-y: auto;
        background: rgba(39,39,42,0.34);
        padding: 24px;
      }

      .figma-profile-edit-card {
        width: min(100%, 620px);
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        padding: 18px;
        box-shadow: 0 24px 80px rgba(39,39,42,0.22);
      }

      .figma-profile-edit-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 14px;
      }

      .figma-profile-edit-head h2,
      .figma-profile-edit-head p,
      .figma-profile-edit-error {
        margin: 0;
      }

      .figma-profile-edit-head h2 {
        color: #3f3f46;
        font-size: 20px;
        font-weight: 900;
        line-height: 1.1;
        letter-spacing: 0;
      }

      .figma-profile-edit-head p {
        margin-top: 5px;
        color: #71717b;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: 0;
      }

      .figma-profile-icon-button {
        display: grid;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        place-items: center;
        border: 2px solid #e4e4e7;
        border-radius: 12px;
        background: #ffffff;
        color: #52525c;
        cursor: pointer;
      }

      .figma-profile-edit-preview {
        position: relative;
        height: 164px;
        overflow: hidden;
        border-radius: 12px;
        background: #707fff;
      }

      .figma-profile-edit-cover {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .figma-profile-edit-avatar {
        position: absolute;
        left: 18px;
        bottom: 18px;
        display: block;
        width: 72px;
        height: 72px;
        border: 3px solid #ffffff;
        border-radius: 23px;
        background: #e4e4e7;
        object-fit: cover;
      }

      .figma-profile-edit-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        padding-top: 16px;
      }

      .figma-profile-edit-field {
        display: grid;
        gap: 8px;
        min-width: 0;
      }

      .figma-profile-edit-field-wide {
        grid-column: 1 / -1;
      }

      .figma-profile-edit-field span {
        color: #52525c;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0;
      }

      .figma-profile-media-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
      }

      .figma-profile-media-button {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 0;
        border-radius: 14px;
        background: #eaf8ff;
        color: #1292cf;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .figma-profile-edit-error {
        margin-top: 14px;
        border: 1px solid #fecaca;
        border-radius: 12px;
        background: #fff1f2;
        color: #dc2626;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
      }

      .figma-profile-edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding-top: 16px;
      }

      .figma-profile-spin {
        animation: figma-profile-spin 860ms linear infinite;
      }

      @keyframes figma-profile-spin {
        to { transform: rotate(360deg); }
      }

      @media (max-width: 760px) {
        .figma-profile-edit-trigger {
          top: calc(clamp(132px, 28vw, 203px) + 68px);
          right: 8px;
        }

        .figma-profile-edit-layer {
          align-items: end;
          padding: 16px;
        }

        .figma-profile-edit-card {
          padding: 16px;
        }

        .figma-profile-edit-grid,
        .figma-profile-media-row {
          grid-template-columns: 1fr;
        }

        .figma-profile-edit-actions {
          display: grid;
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  )
}

function ProfileStatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: 'flame' | 'bolt' | 'league' | 'watch' | 'complete' | 'quiz'
  value: string
  label: string
  tone: string
}) {
  const Icon = {
    flame: Flame,
    bolt: Zap,
    league: ShieldCheck,
    watch: Clock3,
    complete: BookCheck,
    quiz: Trophy,
  }[icon]

  return (
    <article className="figma-profile-stat">
      <span className="figma-profile-stat-icon" style={{ color: tone }}>
        <Icon size={28} fill={icon === 'flame' || icon === 'bolt' ? tone : 'none'} strokeWidth={2.4} />
      </span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </article>
  )
}

function SubjectRadar({ subjects }: { subjects: FigmaProfileSubject[] }) {
  const values = subjects.length > 0 ? subjects : fallbackSubjects.slice(0, 6)
  const center = 130
  const radius = 82
  const labelRadius = 122
  const points = values
    .map((subject, index) => polarPoint(center, center, (radius * subject.score) / 100, index, values.length))
    .map((point) => `${point.x},${point.y}`)
    .join(' ')

  return (
    <article className="figma-profile-radar-card">
      <svg viewBox="0 0 320 259" role="img" aria-label="Subject progress radar">
        {[1, 0.75, 0.5, 0.25].map((scale) => (
          <polygon key={scale} points={ringPoints(center, radius * scale, values.length)} fill="none" stroke="#d6d3d1" strokeWidth="1" />
        ))}
        {values.map((_, index) => {
          const end = polarPoint(center, center, radius, index, values.length)
          return <line key={index} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#d6d3d1" strokeWidth="1" />
        })}
        <polygon points={points} fill="rgba(112,127,255,0.46)" stroke="#707fff" strokeWidth="2" />
        {values.map((subject, index) => {
          const label = polarPoint(center, center, labelRadius, index, values.length)
          return (
            <text key={subject.key} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
              {subject.title}
            </text>
          )
        })}
      </svg>
    </article>
  )
}

function SubjectScoreCard({ subject }: { subject: FigmaProfileSubject }) {
  return (
    <article className="figma-profile-score-card">
      <strong style={{ color: subject.tone }}>{subject.score}</strong>
      <h2>{subject.title}</h2>
      <p>{subject.caption}</p>
    </article>
  )
}

function FollowerPanel({ entries }: { entries: PermanentSidebarLeaderboardEntry[] }) {
  const [tab, setTab] = useState<'followers' | 'following'>('followers')
  const visible = (tab === 'followers' ? entries : entries.slice().reverse()).slice(0, 5)

  return (
    <section className="figma-profile-followers">
      <div className="figma-profile-follow-tabs" role="tablist" aria-label="Connections">
        <button type="button" role="tab" aria-selected={tab === 'followers'} onClick={() => setTab('followers')}>
          Followers
        </button>
        <button type="button" role="tab" aria-selected={tab === 'following'} onClick={() => setTab('following')}>
          Following
        </button>
        <span style={{ transform: tab === 'followers' ? 'translateX(0)' : 'translateX(100%)' }} />
      </div>
      <div className="figma-profile-follow-list">
        {visible.map((entry, index) => (
          <a href="/classement" className="figma-profile-follow-row" key={`${entry.user_id}-${entry.rank}-${index}`}>
            <img src={entry.avatar_url || followerAvatar(index)} alt="" />
            <span>
              <strong>{entry.full_name}</strong>
              <small>{entry.total_xp.toLocaleString()} point</small>
            </span>
            <ChevronRight size={15} strokeWidth={2.4} />
          </a>
        ))}
      </div>
    </section>
  )
}

function normalizeSubjects(subjects: FigmaProfileSubject[]) {
  if (subjects.length === 0) return fallbackSubjects.slice(0, 6)

  const merged = new Map<string, FigmaProfileSubject>()
  for (const subject of subjects) merged.set(subject.key, subject)
  return Array.from(merged.values())
}

function getUsername(user: FigmaProfileUser | null) {
  if (!user?.email) return 'ahmedmalik547'
  return user.email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 28) || 'student'
}

function getJoinedDate(value?: string) {
  if (!value) return 'Joined July 2026'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Joined July 2026'
  return `Joined ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
}

function buildEditDraft(user: FigmaProfileUser | null, xp: FigmaProfileXP | null): FigmaProfileEditDraft {
  return {
    full_name: user?.full_name || 'Ahmed Malik',
    level: user?.niveau || (typeof xp?.level === 'number' ? String(xp.level) : ''),
    track: user?.filiere || user?.track || '',
    avatar_url: user?.avatar_url || defaultAvatarUrl,
    banner_url: user?.banner_url || defaultBannerUrl,
  }
}

function getLeagueLabel(level = 4, entries?: PermanentSidebarLeaderboardEntry[]) {
  const currentEntry = entries?.find((entry) => entry.is_current_user)
  if (currentEntry?.rank) return getLeagueInfoByKey(rankToLeagueKey(currentEntry.rank)).label

  if (level >= 16) return 'Ruby IV'
  if (level >= 11) return 'Emerald IV'
  if (level >= 6) return 'Sapphire IV'
  return 'Bronze IV'
}

function getFollowers(entries?: PermanentSidebarLeaderboardEntry[]) {
  const fallbacks: PermanentSidebarLeaderboardEntry[] = [
    { rank: 1, user_id: 1, full_name: 'Fatima Ansari', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-fatima.png' },
    { rank: 2, user_id: 2, full_name: 'Ahmed Malik', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-ahmed.png' },
    { rank: 3, user_id: 3, full_name: 'Aymen Ben Hamou', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-aymen.png' },
    { rank: 4, user_id: 4, full_name: 'Ibtisam Mahir', total_xp: 541135, level: 7, avatar_url: '/figma-assets/profile/follower-ibtisam.png' },
  ]

  if (!entries || entries.length === 0) return fallbacks
  const nonCurrentEntries = entries.filter((entry) => !entry.is_current_user)
  const source = nonCurrentEntries.length > 0 ? nonCurrentEntries : entries
  return source.slice(0, 5).map((entry, index) => ({
    ...entry,
    avatar_url: entry.avatar_url || followerAvatar(index),
  }))
}

function formatWatchTime(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes < 60) return `${safeMinutes}m`
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

function followerAvatar(index: number) {
  return [
    '/figma-assets/profile/follower-fatima.png',
    '/figma-assets/profile/follower-ahmed.png',
    '/figma-assets/profile/follower-aymen.png',
    '/figma-assets/profile/follower-ibtisam.png',
  ][index % 4]
}

function mediaUrl(value?: string) {
  if (!value) return ''
  if (/^(https?:|data:|blob:)/.test(value)) return value
  if (value.startsWith('/figma-assets/')) return value
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/'
  const origin = apiBase.replace(/\/api\/?$/, '').replace(/\/$/, '')
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`
}

function polarPoint(cx: number, cy: number, r: number, index: number, total: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total
  return {
    x: Number((cx + Math.cos(angle) * r).toFixed(2)),
    y: Number((cy + Math.sin(angle) * r).toFixed(2)),
  }
}

function ringPoints(center: number, radius: number, total: number) {
  return Array.from({ length: total }, (_, index) => {
    const point = polarPoint(center, center, radius, index, total)
    return `${point.x},${point.y}`
  }).join(' ')
}

export function toProfileSubject(title: string, progress: number | undefined, index: number): FigmaProfileSubject {
  const canonical = canonicalSubject(title)
  const fallback = fallbackSubjects.find((subject) => subject.key === canonical.key) ?? fallbackSubjects[index % fallbackSubjects.length]
  const score = clampScore(progress ?? fallback.score)

  return {
    key: canonical.key,
    title: canonical.title,
    score,
    caption: scoreCaption(canonical.key, score),
    tone: scoreTone(score, index),
  }
}

function canonicalSubject(title: string) {
  const normalized = title.toLowerCase()
  if (normalized.includes('math')) return { key: 'math', title: 'Mathematics' }
  if (normalized.includes('phys')) return { key: 'physics', title: 'Physics' }
  if (normalized.includes('chem') || normalized.includes('chim')) return { key: 'chemistry', title: 'Chemistry' }
  if (normalized.includes('geo')) return { key: 'geography', title: 'Geography' }
  if (normalized.includes('bio') || normalized.includes('svt')) return { key: 'biology', title: 'Biology' }
  if (normalized.includes('philo')) return { key: 'philosophy', title: 'Philosophy' }
  if (normalized.includes('english') || normalized.includes('anglais')) return { key: 'english', title: 'English' }
  return { key: normalized.replace(/\W+/g, '-') || 'subject', title }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreTone(score: number, index: number) {
  if (score < 45) return '#ff6467'
  if (score < 60) return '#ff8904'
  if (score >= 85) return '#009966'
  return ['#453dee', '#51a2ff', '#707fff'][index % 3]
}

function scoreCaption(key: string, score: number) {
  if (key === 'chemistry' && score >= 85) return 'Oh my god, are you Mendeleev'
  if (key === 'geography') return 'Cool, you know your continents!'
  if (score < 45) return 'Almost there, just a little more effort'
  if (score < 65) return "You're doing good keep it up"
  return 'Strong progress, keep the rhythm'
}
