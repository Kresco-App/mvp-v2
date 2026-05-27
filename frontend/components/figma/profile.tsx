'use client'

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { BookCheck, Bookmark, Camera, ChevronRight, Clock3, Flame, Loader2, Pencil, Save, ShieldCheck, Star, StickyNote, Trophy, X, Zap } from 'lucide-react'
import {
  DEFAULT_PROFILE_AVATAR_URL,
  DEFAULT_PROFILE_BANNER_URL,
  buildEditDraft,
  buildProfileNoteHubItems,
  buildProfileSaveHubItems,
  fallbackSubjects,
  followerAvatar,
  formatWatchTime,
  getFollowers,
  getJoinedDate,
  getLeagueLabel,
  getUsername,
  mediaUrl,
  normalizeSubjects,
  polarPoint,
  ringPoints,
  type FigmaProfileEditDraft,
  type FigmaProfileMediaKind,
  type FigmaProfileNote,
  type FigmaProfileSavedItem,
  type FigmaProfileSidebarData,
  type FigmaProfileStats,
  type FigmaProfileSubject,
  type FigmaProfileUser,
  type FigmaProfileXP,
} from '@/lib/profileViewModel'
import {
  CalendarCard,
  ChronoCard,
} from './permanent-sidebar'
import type { PermanentSidebarLeaderboardEntry } from '@/lib/permanentSidebarViewModel'

export type FigmaProfileProps = {
  user: FigmaProfileUser | null
  xp: FigmaProfileXP | null
  stats?: FigmaProfileStats | null
  subjects: FigmaProfileSubject[]
  sidebar: FigmaProfileSidebarData
  notes?: FigmaProfileNote[]
  saves?: FigmaProfileSavedItem[]
  loading?: boolean
  editable?: boolean
  saving?: boolean
  editError?: string | null
  onSaveProfile?: (draft: FigmaProfileEditDraft) => void | Promise<void>
  onSelectMedia?: (kind: FigmaProfileMediaKind, draft: FigmaProfileEditDraft) => string | undefined | Promise<string | undefined>
}

const badgeTones = ['#5b60f9', '#c4d1ff', '#51a2ff', '#ff8904']
const PROFILE_HUB_VISIBLE_ITEMS = 4

export function FigmaProfile({
  user,
  xp,
  stats,
  subjects,
  sidebar,
  notes = [],
  saves = [],
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
  const avatarUrl = mediaUrl(optimisticDraft?.avatar_url || user?.avatar_url || DEFAULT_PROFILE_AVATAR_URL)
  const bannerUrl = mediaUrl(optimisticDraft?.banner_url || user?.banner_url || DEFAULT_PROFILE_BANNER_URL)
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

          <ProfileHub notes={notes} saves={saves} />
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
              <img className="figma-profile-edit-cover" src={mediaUrl(draft.banner_url || DEFAULT_PROFILE_BANNER_URL)} alt="" />
              <img className="figma-profile-edit-avatar" src={mediaUrl(draft.avatar_url || DEFAULT_PROFILE_AVATAR_URL)} alt="" referrerPolicy="no-referrer" />
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
                    placeholder={DEFAULT_PROFILE_AVATAR_URL}
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
                    placeholder={DEFAULT_PROFILE_BANNER_URL}
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

function ProfileHub({ notes, saves }: { notes: FigmaProfileNote[]; saves: FigmaProfileSavedItem[] }) {
  const noteItems = useMemo(() => buildProfileNoteHubItems(notes, PROFILE_HUB_VISIBLE_ITEMS), [notes])
  const saveItems = useMemo(() => buildProfileSaveHubItems(saves, PROFILE_HUB_VISIBLE_ITEMS), [saves])

  return (
    <section className="figma-profile-hub" aria-label="Notes and saved items">
      <ProfileHubColumn
        icon={<StickyNote size={18} />}
        title="Recent notes"
        empty="Notes you save in a topic will appear here."
        items={noteItems}
      />
      <ProfileHubColumn
        icon={<Bookmark size={18} />}
        title="Saved items"
        empty="Saved lessons, resources, quizzes, and exam problems will appear here."
        items={saveItems}
      />
    </section>
  )
}

function ProfileHubColumn({
  icon,
  title,
  empty,
  items,
}: {
  icon: ReactNode
  title: string
  empty: string
  items: { id: string; href: string; title: string; meta: string }[]
}) {
  return (
    <article className="figma-profile-hub-column">
      <div className="figma-profile-hub-heading">
        <span>{icon}</span>
        <strong>{title}</strong>
      </div>
      {items.length > 0 ? (
        <div className="figma-profile-hub-list">
          {items.map((item) => (
            <a href={item.href} key={item.id} className="figma-profile-hub-row">
              <span>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
              <ChevronRight size={15} strokeWidth={2.4} />
            </a>
          ))}
        </div>
      ) : (
        <p>{empty}</p>
      )}
    </article>
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

      .figma-profile-hub {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        padding-top: 18px;
      }

      .figma-profile-hub-column {
        min-width: 0;
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        padding: 16px;
      }

      .figma-profile-hub-heading {
        display: flex;
        align-items: center;
        gap: 9px;
        color: #3f3f46;
      }

      .figma-profile-hub-heading span {
        display: grid;
        width: 34px;
        height: 34px;
        place-items: center;
        border-radius: 12px;
        background: #eaf8ff;
        color: #1292cf;
      }

      .figma-profile-hub-heading strong {
        font-size: 15px;
        font-weight: 900;
        line-height: 1;
      }

      .figma-profile-hub-list {
        display: grid;
        gap: 9px;
        padding-top: 13px;
      }

      .figma-profile-hub-row {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-radius: 13px;
        background: #f7f8fb;
        color: #3f3f46;
        padding: 12px;
        text-decoration: none;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }

      .figma-profile-hub-row:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(24,24,27,0.08);
      }

      .figma-profile-hub-row span {
        min-width: 0;
      }

      .figma-profile-hub-row strong {
        display: block;
        overflow: hidden;
        color: #3f3f46;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .figma-profile-hub-row small {
        display: block;
        margin-top: 4px;
        color: #71717b;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        text-transform: capitalize;
      }

      .figma-profile-hub-column p {
        margin: 13px 0 0;
        color: #71717b;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
      }

      @media (max-width: 980px) {
        .figma-profile-hub {
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

