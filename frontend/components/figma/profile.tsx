'use client'

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Award, Bell, BookCheck, Bookmark, Camera, ChevronRight, Clock3, CreditCard, Download, Flame, KeyRound, Languages, LayoutDashboard, Loader2, LockKeyhole, Mail, Monitor, Palette, Pencil, Save, Settings, ShieldCheck, Smartphone, Star, StickyNote, Trash2, Trophy, X, Zap } from 'lucide-react'
import {
  DEFAULT_PROFILE_AVATAR_URL,
  DEFAULT_PROFILE_BANNER_URL,
  buildEditDraft,
  buildProfileBadgeItems,
  buildProfileNoteHubItems,
  buildProfileSaveHubItems,
  fallbackSubjects,
  followerAvatar,
  formatProfileBadgeStatus,
  formatWatchTime,
  getFollowers,
  getJoinedDate,
  getLeagueLabel,
  getUsername,
  mediaUrl,
  normalizeSubjects,
  polarPoint,
  profileBadgeSummary,
  ringPoints,
  type FigmaProfileBadge,
  type FigmaProfileBadgeInventory,
  type FigmaProfileEditDraft,
  type FigmaProfileHubItem,
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
} from './permanent-sidebar-cards'
import type { PermanentSidebarLeaderboardEntry } from '@/lib/permanentSidebarViewModel'
import { useEscapeKey } from '@/hooks/useClickOutside'

export type FigmaProfileProps = {
  user: FigmaProfileUser | null
  xp: FigmaProfileXP | null
  stats?: FigmaProfileStats | null
  badgeInventory?: FigmaProfileBadgeInventory | null
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
  onRoutePreload?: (href: string) => void
}

const PROFILE_BADGE_VISIBLE_ITEMS = 6
const PROFILE_COLLECTION_LIMIT = 100
type ProfileViewKey = 'dashboard' | 'badges' | 'saved' | 'notes' | 'settings'

function profileToneTextClass(tone: string) {
  switch (tone) {
    case '#ff8904':
      return 'text-[#ff8904]'
    case '#ffd61a':
      return 'text-[#ffd61a]'
    case '#707fff':
      return 'text-[#707fff]'
    case '#51a2ff':
      return 'text-[#51a2ff]'
    case '#009966':
      return 'text-[#009966]'
    case '#5b60f9':
      return 'text-[#5b60f9]'
    case '#ff6467':
      return 'text-[#ff6467]'
    case '#453dee':
      return 'text-[#453dee]'
    case '#c4d1ff':
      return 'text-[#c4d1ff]'
    default:
      return 'text-[#5b60f9]'
  }
}

function profileToneBgClass(tone: string) {
  switch (tone) {
    case '#009966':
      return 'bg-[#009966]'
    case '#c4d1ff':
      return 'bg-[#c4d1ff]'
    case '#51a2ff':
      return 'bg-[#51a2ff]'
    case '#707fff':
      return 'bg-[#707fff]'
    case '#ffd61a':
      return 'bg-[#ffd61a]'
    case '#ff8904':
      return 'bg-[#ff8904]'
    default:
      return 'bg-[#5b60f9]'
  }
}

function profileToneAccentClass(tone: string) {
  switch (tone) {
    case '#009966':
      return 'is-tone-success'
    case '#c4d1ff':
      return 'is-tone-muted'
    case '#51a2ff':
      return 'is-tone-sky'
    case '#707fff':
      return 'is-tone-indigo'
    case '#ffd61a':
      return 'is-tone-gold'
    case '#ff8904':
      return 'is-tone-orange'
    default:
      return 'is-tone-primary'
  }
}

export function FigmaProfile({
  user,
  xp,
  stats,
  badgeInventory,
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
  onRoutePreload,
}: FigmaProfileProps) {
  const visibleSubjects = useMemo(() => normalizeSubjects(subjects), [subjects])
  const allBadges = useMemo(
    () => buildProfileBadgeItems(badgeInventory, xp, stats, PROFILE_COLLECTION_LIMIT),
    [badgeInventory, stats, xp],
  )
  const visibleBadges = allBadges.slice(0, PROFILE_BADGE_VISIBLE_ITEMS)
  const badgeSummary = useMemo(
    () => profileBadgeSummary(badgeInventory, allBadges),
    [allBadges, badgeInventory],
  )
  const [activeView, setActiveView] = useState<ProfileViewKey>('dashboard')
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
  const completedLessons = stats?.itemsCompleted ?? 0
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

  useEscapeKey(() => {
    if (isSaving || isMediaSelecting) return
    setEditing(false)
    setLocalError(null)
  }, editing)

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
              <Image src={bannerUrl} alt="" fill sizes="720px" priority unoptimized className="kresco-media-outline" />
            </div>
            <div className="figma-profile-avatar" aria-label="Profile picture">
              <Image src={avatarUrl} alt={firstName} fill sizes="82px" unoptimized referrerPolicy="no-referrer" className="kresco-media-outline" />
            </div>

            <div className="figma-profile-badges" aria-label={`Badges: ${badgeSummary.earnedCount} of ${badgeSummary.totalCount} earned`}>
              {visibleBadges.map((badge, index) => (
                <span
                  key={badge.slug}
                  className={`figma-profile-badge ${profileToneBgClass(profileBadgeTone(badge, index))}${badge.earned ? '' : ' is-locked'}`}
                  title={`${badge.title}: ${formatProfileBadgeStatus(badge)}`}
                  role="img"
                  aria-label={`${badge.title}, ${badge.earned ? 'earned' : 'locked'}`}
                >
                  <ProfileBadgeGlyph badge={badge} size={13} />
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

          <ProfileViewNav
            activeView={activeView}
            badgeSummary={badgeSummary}
            notesCount={notes.length}
            onChange={setActiveView}
            savesCount={saves.length}
          />

          {activeView === 'dashboard' ? (
            <>
              <ProfileBadgePanel badges={visibleBadges} summary={badgeSummary} />

              <section className="figma-profile-subjects" aria-label="Subject progress">
                <SubjectRadar subjects={visibleSubjects.slice(0, 6)} />
                {visibleSubjects.map((subject) => (
                  <SubjectScoreCard subject={subject} key={subject.key} />
                ))}
              </section>
            </>
          ) : null}

          {activeView === 'badges' ? <ProfileBadgePanel badges={allBadges} summary={badgeSummary} variant="collection" /> : null}
          {activeView === 'saved' ? <ProfileSavedItemsView onRoutePreload={onRoutePreload} saves={saves} /> : null}
          {activeView === 'notes' ? <ProfileNotesView notes={notes} onRoutePreload={onRoutePreload} /> : null}
          {activeView === 'settings' ? (
            <ProfileSettingsView
              draft={baseDraft}
              editable={editable}
              isSaving={isSaving}
              joined={joined}
              onEdit={openEditor}
              user={user}
              username={username}
            />
          ) : null}
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
              <Image className="figma-profile-edit-cover kresco-media-outline" src={mediaUrl(draft.banner_url || DEFAULT_PROFILE_BANNER_URL)} alt="" fill sizes="520px" unoptimized />
              <Image className="figma-profile-edit-avatar kresco-media-outline" src={mediaUrl(draft.avatar_url || DEFAULT_PROFILE_AVATAR_URL)} alt="" width={72} height={72} unoptimized referrerPolicy="no-referrer" />
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

function ProfileViewNav({
  activeView,
  badgeSummary,
  notesCount,
  onChange,
  savesCount,
}: {
  activeView: ProfileViewKey
  badgeSummary: { earnedCount: number; totalCount: number }
  notesCount: number
  onChange: (view: ProfileViewKey) => void
  savesCount: number
}) {
  const views: Array<{
    key: ProfileViewKey
    label: string
    meta: string
    icon: typeof LayoutDashboard
  }> = [
    { key: 'dashboard', label: 'Dashboard', meta: 'Overview', icon: LayoutDashboard },
    { key: 'badges', label: 'Badges', meta: `${badgeSummary.earnedCount}/${badgeSummary.totalCount}`, icon: Award },
    { key: 'saved', label: 'Saved', meta: formatHubCount(savesCount, 'item', 'items'), icon: Bookmark },
    { key: 'notes', label: 'Notes', meta: formatHubCount(notesCount, 'note', 'notes'), icon: StickyNote },
    { key: 'settings', label: 'Settings', meta: 'Profile', icon: Settings },
  ]

  return (
    <nav className="figma-profile-view-nav" aria-label="Profile sections">
      <div role="tablist" aria-label="Profile sections">
        {views.map((view) => {
          const Icon = view.icon
          const selected = activeView === view.key
          return (
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'is-active' : ''}
              key={view.key}
              onClick={() => onChange(view.key)}
            >
              <Icon size={16} strokeWidth={2.4} />
              <span>
                <strong>{view.label}</strong>
                <small>{view.meta}</small>
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function ProfileBadgePanel({
  badges,
  summary,
  variant = 'preview',
}: {
  badges: FigmaProfileBadge[]
  summary: { earnedCount: number; totalCount: number }
  variant?: 'preview' | 'collection'
}) {
  return (
    <section className={`figma-profile-awards${variant === 'collection' ? ' is-collection' : ''}`} aria-label="Badge progress">
      <div className="figma-profile-awards-head">
        <span>
          <Award size={18} strokeWidth={2.4} />
          Badges
        </span>
        <strong>{summary.earnedCount}/{summary.totalCount} earned</strong>
      </div>
      <div className="figma-profile-awards-list">
        {badges.map((badge, index) => (
          <article
            className={`figma-profile-award ${profileToneAccentClass(profileBadgeTone(badge, index))}${badge.earned ? '' : ' is-locked'}`}
            key={badge.slug}
          >
            <span className="figma-profile-award-icon" aria-hidden="true">
              <ProfileBadgeGlyph badge={badge} size={19} />
            </span>
            <span className="figma-profile-award-copy">
              <strong>{badge.title}</strong>
              <small>{formatProfileBadgeStatus(badge)}</small>
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProfileSavedItemsView({
  onRoutePreload,
  saves,
}: {
  onRoutePreload?: (href: string) => void
  saves: FigmaProfileSavedItem[]
}) {
  const items = useMemo(() => buildProfileSaveHubItems(saves, PROFILE_COLLECTION_LIMIT), [saves])

  return (
    <section className="figma-profile-collection" aria-label="Saved items viewer">
      <ProfileCollectionHead
        icon={<Bookmark size={18} />}
        title="Saved items"
        meta={formatHubCount(saves.length, 'saved item', 'saved items')}
      />
      {items.length > 0 ? (
        <div className="figma-profile-collection-list">
          {items.map((item) => (
            <ProfileCollectionLink item={item} key={item.id} onRoutePreload={onRoutePreload} />
          ))}
        </div>
      ) : (
        <ProfileCollectionEmpty copy="Saved lessons, resources, quizzes, and exam problems will appear here." />
      )}
    </section>
  )
}

function ProfileNotesView({
  notes,
  onRoutePreload,
}: {
  notes: FigmaProfileNote[]
  onRoutePreload?: (href: string) => void
}) {
  const items = useMemo(() => buildProfileNoteHubItems(notes, PROFILE_COLLECTION_LIMIT), [notes])

  return (
    <section className="figma-profile-collection" aria-label="Notes aggregator">
      <ProfileCollectionHead
        icon={<StickyNote size={18} />}
        title="Notes"
        meta={formatHubCount(notes.length, 'note', 'notes')}
      />
      {items.length > 0 ? (
        <div className="figma-profile-collection-list">
          {items.map((item) => (
            <ProfileCollectionLink item={item} key={item.id} onRoutePreload={onRoutePreload} />
          ))}
        </div>
      ) : (
        <ProfileCollectionEmpty copy="Notes you save in a topic will appear here." />
      )}
    </section>
  )
}

function ProfileCollectionHead({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="figma-profile-collection-head">
      <span className="figma-profile-hub-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
    </div>
  )
}

function ProfileCollectionLink({
  item,
  onRoutePreload,
}: {
  item: FigmaProfileHubItem
  onRoutePreload?: (href: string) => void
}) {
  function preloadDestination() {
    onRoutePreload?.(item.href)
  }

  return (
    <Link
      href={item.href}
      className="figma-profile-collection-row"
      onFocus={preloadDestination}
      onMouseOver={preloadDestination}
      onPointerEnter={preloadDestination}
    >
      <span className="figma-profile-hub-copy">
        <strong>{item.title}</strong>
        <small>{item.meta}</small>
        {item.detail ? <span className="figma-profile-hub-detail">{item.detail}</span> : null}
        {item.tags && item.tags.length > 0 ? (
          <span className="figma-profile-hub-tags" aria-label={`Tags: ${item.tags.join(', ')}`}>
            {item.tags.map((tag) => (
              <span className="figma-profile-hub-tag" key={tag}>{tag}</span>
            ))}
          </span>
        ) : null}
      </span>
      <ChevronRight size={16} strokeWidth={2.4} />
    </Link>
  )
}

function ProfileCollectionEmpty({ copy }: { copy: string }) {
  return (
    <p className="figma-profile-collection-empty">{copy}</p>
  )
}

function ProfileSettingsView({
  draft,
  editable,
  isSaving,
  joined,
  onEdit,
  user,
  username,
}: {
  draft: FigmaProfileEditDraft
  editable: boolean
  isSaving: boolean
  joined: string
  onEdit: () => void
  user: FigmaProfileUser | null
  username: string
}) {
  const accountRows = [
    { label: 'Display name', value: draft.full_name },
    { label: 'Username', value: username },
    { label: 'Email', value: user?.email || 'Not set' },
    { label: 'Joined', value: joined.replace(/^Joined\s+/, '') },
    { label: 'Level', value: draft.level || 'Not set' },
    { label: 'Track', value: draft.track || 'Not set' },
  ]
  const learningRows = [
    { icon: <Languages size={17} strokeWidth={2.4} />, title: 'Language', detail: 'French interface, Moroccan curriculum' },
    { icon: <BookCheck size={17} strokeWidth={2.4} />, title: 'Study goal', detail: 'BAC prep with weekly progress pacing' },
    { icon: <Palette size={17} strokeWidth={2.4} />, title: 'Theme', detail: 'System theme, Kresco accent colors' },
    { icon: <Monitor size={17} strokeWidth={2.4} />, title: 'Workspace density', detail: 'Comfortable cards and compact tables' },
  ]
  const notificationRows = [
    { icon: <Bell size={17} strokeWidth={2.4} />, title: 'Learning reminders', detail: 'Daily streaks, saved notes, and unfinished lessons' },
    { icon: <Mail size={17} strokeWidth={2.4} />, title: 'Email updates', detail: 'Receipts, account alerts, and course changes' },
    { icon: <Smartphone size={17} strokeWidth={2.4} />, title: 'Live session alerts', detail: 'Before class starts and when a professor replies' },
  ]
  const securityRows = [
    { icon: <KeyRound size={17} strokeWidth={2.4} />, title: 'Password and sign-in', detail: 'Manage login methods and active sessions' },
    { icon: <ShieldCheck size={17} strokeWidth={2.4} />, title: 'Profile visibility', detail: 'Leaderboard, saved activity, and public badge visibility' },
  ]
  const accountActions = [
    { icon: <CreditCard size={17} strokeWidth={2.4} />, title: 'Plan and invoices', detail: 'Subscription, manual payments, and receipts' },
    { icon: <Download size={17} strokeWidth={2.4} />, title: 'Export learning data', detail: 'Download notes, saved items, and progress history' },
    { icon: <Trash2 size={17} strokeWidth={2.4} />, title: 'Delete account', detail: 'Request account deletion and data removal', danger: true },
  ]

  return (
    <section className="figma-profile-settings" aria-label="Profile settings">
      <div className="figma-profile-settings-head">
        <span>
          <Settings size={18} strokeWidth={2.4} />
          Settings
        </span>
        {editable ? (
          <button type="button" onClick={onEdit} disabled={isSaving}>
            <Pencil size={15} strokeWidth={2.5} />
            Edit profile
          </button>
        ) : null}
      </div>
      <ProfileSettingsSection title="Account" meta="Identity and school profile">
        <div className="figma-profile-settings-grid">
          {accountRows.map((row) => <ProfileSettingField key={row.label} label={row.label} value={row.value} />)}
        </div>
      </ProfileSettingsSection>
      <ProfileSettingsSection title="Learning" meta="Default study experience">
        <div className="figma-profile-settings-list">
          {learningRows.map((row) => <ProfileSettingsRow key={row.title} {...row} />)}
        </div>
      </ProfileSettingsSection>
      <ProfileSettingsSection title="Notifications" meta="Reminders and alerts">
        <div className="figma-profile-settings-list">
          {notificationRows.map((row) => <ProfileSettingsRow key={row.title} {...row} />)}
        </div>
      </ProfileSettingsSection>
      <ProfileSettingsSection title="Privacy and security" meta="Access and visibility">
        <div className="figma-profile-settings-list">
          {securityRows.map((row) => <ProfileSettingsRow key={row.title} {...row} />)}
        </div>
      </ProfileSettingsSection>
      <ProfileSettingsSection title="Billing and data" meta="Payments, exports, and account control">
        <div className="figma-profile-settings-list">
          {accountActions.map((row) => <ProfileSettingsRow key={row.title} {...row} />)}
        </div>
      </ProfileSettingsSection>
    </section>
  )
}

function ProfileSettingsSection({ children, meta, title }: { children: ReactNode; meta: string; title: string }) {
  return (
    <section className="figma-profile-settings-section">
      <div className="figma-profile-settings-section-head">
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      {children}
    </section>
  )
}

function ProfileSettingField({ label, value }: { label: string; value: string }) {
  return (
    <article className="figma-profile-setting-field">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  )
}

function ProfileSettingsRow({
  danger = false,
  detail,
  icon,
  title,
}: {
  danger?: boolean
  detail: string
  icon: ReactNode
  title: string
}) {
  return (
    <button type="button" className={`figma-profile-settings-row${danger ? ' is-danger' : ''}`}>
      <span className="figma-profile-settings-row-icon">{icon}</span>
      <span className="figma-profile-settings-row-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={16} strokeWidth={2.4} />
    </button>
  )
}

function ProfileBadgeGlyph({ badge, size }: { badge: FigmaProfileBadge; size: number }) {
  if (!badge.earned) return <LockKeyhole size={size} strokeWidth={2.5} />

  const Icon = profileBadgeIcon(badge)
  return <Icon size={size} fill={profileBadgeIconFill(badge)} strokeWidth={2.4} />
}

function profileBadgeIcon(badge: FigmaProfileBadge) {
  switch (badge.category) {
    case 'xp':
      return Star
    case 'streak':
      return Flame
    case 'exercise':
      return BookCheck
    case 'exam':
      return Trophy
    case 'revision':
      return ShieldCheck
    default:
      return Award
  }
}

function profileBadgeIconFill(badge: FigmaProfileBadge) {
  return badge.category === 'xp' || badge.category === 'streak' ? 'currentColor' : 'none'
}

function profileBadgeTone(badge: FigmaProfileBadge, index: number) {
  if (!badge.earned) return '#c4d1ff'

  switch (badge.category) {
    case 'xp':
      return badge.rarity === 'rare' ? '#ffd61a' : '#5b60f9'
    case 'streak':
      return '#ff8904'
    case 'exercise':
      return '#009966'
    case 'exam':
      return '#51a2ff'
    case 'revision':
      return '#707fff'
    default:
      return ['#5b60f9', '#51a2ff', '#ff8904'][index % 3]
  }
}

function formatHubCount(count: number, singular: string, plural: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
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
        min-height: 40px;
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
        transition-property: background-color, border-color, box-shadow, color, opacity, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-edit-trigger:disabled,
      .figma-profile-icon-button:disabled,
      .figma-profile-media-button:disabled,
      .figma-profile-edit-actions button:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-edit-trigger:not(:disabled):hover {
          border-color: rgba(255,255,255,0.92);
          background: #ffffff;
          box-shadow: 0 14px 30px rgba(24,24,27,0.16);
          transform: translateY(-1px);
        }
      }

      .figma-profile-edit-trigger:not(:disabled):active {
        transform: scale(0.96);
      }

      .figma-profile-edit-trigger:focus-visible {
        outline: 3px solid rgba(91,96,249,0.24);
        outline-offset: 2px;
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
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        place-items: center;
        border: 2px solid #e4e4e7;
        border-radius: 12px;
        background: #ffffff;
        color: #52525c;
        cursor: pointer;
        transition-property: background-color, border-color, color, opacity, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-icon-button:not(:disabled):hover {
          border-color: #c4d1ff;
          background: #f7f8ff;
          color: #453dee;
        }
      }

      .figma-profile-icon-button:not(:disabled):active {
        transform: scale(0.96);
      }

      .figma-profile-icon-button:focus-visible {
        outline: 3px solid rgba(91,96,249,0.24);
        outline-offset: 2px;
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
        pointer-events: none;
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
        pointer-events: none;
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
        transition-property: background-color, color, opacity, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-media-button:not(:disabled):hover {
          background: #dff4ff;
          transform: translateY(-1px);
        }
      }

      .figma-profile-media-button:not(:disabled):active {
        transform: scale(0.96);
      }

      .figma-profile-media-button:focus-visible {
        outline: 3px solid rgba(18,146,207,0.22);
        outline-offset: 2px;
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

      .figma-profile-view-nav {
        width: 720px;
        padding-top: 18px;
      }

      .figma-profile-view-nav > div {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        padding: 8px;
      }

      .figma-profile-view-nav button {
        display: grid;
        min-width: 0;
        min-height: 58px;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: #71717b;
        padding: 0 10px;
        text-align: left;
        cursor: pointer;
        transition-property: background-color, color, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-view-nav button:hover,
      .figma-profile-view-nav button:focus-visible {
        background: #f7f8fb;
        color: #3f3f46;
      }

      .figma-profile-view-nav button:focus-visible {
        outline: 3px solid rgba(91,96,249,0.24);
        outline-offset: 2px;
      }

      .figma-profile-view-nav button.is-active {
        background: #eef2ff;
        color: #453dee;
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-view-nav button:hover {
          transform: translateY(-1px);
        }
      }

      .figma-profile-view-nav button:active {
        transform: scale(0.96);
      }

      .figma-profile-view-nav button span {
        display: grid;
        min-width: 0;
        gap: 4px;
      }

      .figma-profile-view-nav button strong,
      .figma-profile-view-nav button small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .figma-profile-view-nav button strong {
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
      }

      .figma-profile-view-nav button small {
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }

      .figma-profile-badge {
        color: #ffffff;
        transition-property: box-shadow, opacity, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-badge.is-locked {
        opacity: 0.68;
        box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.1), inset 0 2px 0 rgba(255, 255, 255, 0.42);
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-badge:hover {
          transform: translateY(-1px);
        }
      }

      .figma-profile-awards {
        display: grid;
        width: 720px;
        gap: 12px;
        padding-top: 18px;
      }

      .figma-profile-awards-head {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .figma-profile-awards-head span,
      .figma-profile-awards-head strong {
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }

      .figma-profile-awards-head span {
        gap: 8px;
        color: #3f3f46;
        font-size: 15px;
        font-weight: 900;
      }

      .figma-profile-awards-head strong {
        min-height: 28px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: #f4f4f5;
        color: #52525c;
        padding: 0 11px;
        font-size: 12px;
        font-weight: 900;
      }

      .figma-profile-awards-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .figma-profile-award {
        --profile-badge-accent: #5b60f9;
        display: grid;
        min-width: 0;
        min-height: 76px;
        grid-template-columns: 40px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        border: 2px solid #e4e4e7;
        border-radius: 14px;
        background: #ffffff;
        padding: 12px;
        transition-property: border-color, box-shadow, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-award.is-tone-success {
        --profile-badge-accent: #009966;
      }

      .figma-profile-award.is-tone-muted {
        --profile-badge-accent: #c4d1ff;
      }

      .figma-profile-award.is-tone-sky {
        --profile-badge-accent: #51a2ff;
      }

      .figma-profile-award.is-tone-indigo {
        --profile-badge-accent: #707fff;
      }

      .figma-profile-award.is-tone-gold {
        --profile-badge-accent: #ffd61a;
      }

      .figma-profile-award.is-tone-orange {
        --profile-badge-accent: #ff8904;
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-award:hover {
          border-color: color-mix(in srgb, var(--profile-badge-accent) 38%, #e4e4e7);
          box-shadow: 0 10px 22px rgba(24,24,27,0.08);
          transform: translateY(-1px);
        }
      }

      .figma-profile-award.is-locked {
        background: #fafafa;
      }

      .figma-profile-award-icon {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border-radius: 13px;
        background: #f4f4f5;
        background: color-mix(in srgb, var(--profile-badge-accent) 14%, #ffffff);
        color: var(--profile-badge-accent);
      }

      .figma-profile-award-copy {
        min-width: 0;
      }

      .figma-profile-award-copy strong,
      .figma-profile-award-copy small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .figma-profile-award-copy strong {
        color: #3f3f46;
        font-size: 13px;
        font-weight: 900;
        line-height: 1.2;
        white-space: nowrap;
      }

      .figma-profile-award-copy small {
        display: -webkit-box;
        margin-top: 5px;
        color: #71717b;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.25;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .figma-profile-awards.is-collection {
        padding-top: 18px;
      }

      .figma-profile-awards.is-collection .figma-profile-awards-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .figma-profile-awards.is-collection .figma-profile-award {
        min-height: 92px;
      }

      .figma-profile-awards.is-collection .figma-profile-award-copy strong {
        display: -webkit-box;
        white-space: normal;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
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

        .figma-profile-view-nav {
          width: 100%;
        }

        .figma-profile-view-nav > div {
          display: flex;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }

        .figma-profile-view-nav button {
          min-width: 132px;
        }

        .figma-profile-awards {
          width: 100%;
        }

        .figma-profile-collection,
        .figma-profile-settings {
          width: 100%;
        }

        .figma-profile-awards-list,
        .figma-profile-awards.is-collection .figma-profile-awards-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .figma-profile-edit-actions {
          display: grid;
          grid-template-columns: 1fr;
        }
      }

      .figma-profile-hub-icon {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 12px;
        background: #eaf8ff;
        color: #1292cf;
      }

      .figma-profile-hub-copy {
        display: grid;
        gap: 5px;
        min-width: 0;
      }

      .figma-profile-hub-detail {
        display: -webkit-box;
        overflow: hidden;
        color: #71717b;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .figma-profile-hub-tags {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        gap: 5px;
        padding-top: 2px;
      }

      .figma-profile-hub-tag {
        display: inline-flex;
        max-width: 116px;
        min-height: 22px;
        align-items: center;
        overflow: hidden;
        border-radius: 999px;
        background: #eef2ff;
        color: #453dee;
        padding: 0 8px;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .figma-profile-collection,
      .figma-profile-settings {
        display: grid;
        width: 720px;
        gap: 14px;
        padding-top: 18px;
      }

      .figma-profile-collection-head,
      .figma-profile-settings-head {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        padding: 14px 16px;
      }

      .figma-profile-collection-head > span:last-child,
      .figma-profile-settings-head > span {
        display: grid;
        min-width: 0;
        gap: 5px;
      }

      .figma-profile-collection-head strong,
      .figma-profile-settings-head span {
        color: #3f3f46;
        font-size: 15px;
        font-weight: 900;
        line-height: 1;
      }

      .figma-profile-collection-head small {
        color: #9f9fa9;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }

      .figma-profile-collection-list {
        display: grid;
        gap: 10px;
      }

      .figma-profile-collection-row {
        content-visibility: auto;
        contain-intrinsic-size: auto 82px;
        display: grid;
        min-width: 0;
        min-height: 82px;
        grid-template-columns: minmax(0, 1fr) 18px;
        align-items: center;
        gap: 14px;
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        color: #3f3f46;
        padding: 14px 16px;
        text-decoration: none;
        transition-property: border-color, box-shadow, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-collection-row:focus-visible {
        border-color: #c4d1ff;
        box-shadow: 0 12px 24px rgba(24,24,27,0.08);
      }

      .figma-profile-collection-row:focus-visible {
        outline: 3px solid rgba(91,96,249,0.24);
        outline-offset: 2px;
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-collection-row:hover {
          border-color: #c4d1ff;
          box-shadow: 0 12px 24px rgba(24,24,27,0.08);
          transform: translateY(-1px);
        }
      }

      .figma-profile-collection-row:active {
        transform: scale(0.96);
      }

      .figma-profile-collection-row > svg {
        color: #9f9fa9;
      }

      .figma-profile-collection-empty {
        margin: 0;
        border: 2px dashed #e4e4e7;
        border-radius: 16px;
        background: #fafafa;
        color: #71717b;
        padding: 18px;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.35;
      }

      .figma-profile-settings-head span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .figma-profile-settings-head button {
        display: inline-flex;
        min-height: 40px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 0;
        border-radius: 12px;
        background: #453dee;
        color: #ffffff;
        padding: 0 13px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
        transition-property: background-color, color, opacity, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-settings-head button:not(:disabled):hover {
          background: #3a2fd3;
          transform: translateY(-1px);
        }
      }

      .figma-profile-settings-head button:not(:disabled):active {
        transform: scale(0.96);
      }

      .figma-profile-settings-head button:focus-visible {
        outline: 3px solid rgba(69, 61, 238, 0.18);
        outline-offset: 2px;
      }

      .figma-profile-settings-head button:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }

      .figma-profile-settings-section {
        display: grid;
        gap: 12px;
        border-top: 1px solid #ececf0;
        padding-top: 16px;
      }

      .figma-profile-settings-section:first-of-type {
        border-top: 0;
        padding-top: 0;
      }

      .figma-profile-settings-section-head {
        display: flex;
        min-width: 0;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }

      .figma-profile-settings-section-head strong {
        color: #27272a;
        font-size: 15px;
        font-weight: 950;
        line-height: 1.1;
      }

      .figma-profile-settings-section-head small {
        min-width: 0;
        color: #9f9fa9;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.3;
        text-align: right;
      }

      .figma-profile-settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .figma-profile-setting-field {
        display: grid;
        min-width: 0;
        gap: 8px;
        border: 2px solid #e4e4e7;
        border-radius: 16px;
        background: #ffffff;
        padding: 15px;
      }

      .figma-profile-setting-field small,
      .figma-profile-setting-field strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .figma-profile-setting-field small {
        color: #9f9fa9;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;
        text-transform: uppercase;
      }

      .figma-profile-setting-field strong {
        color: #3f3f46;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .figma-profile-settings-list {
        display: grid;
        gap: 8px;
      }

      .figma-profile-settings-row {
        display: flex;
        min-height: 58px;
        width: 100%;
        min-width: 0;
        align-items: center;
        gap: 12px;
        border: 1px solid #e9e9ef;
        border-radius: 14px;
        background: #ffffff;
        color: #52525c;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        transition-property: background-color, border-color, box-shadow, color, transform;
        transition-duration: var(--motion-quick, 150ms);
        transition-timing-function: var(--motion-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      .figma-profile-settings-row:hover {
        border-color: #dcdcf8;
        background: #fbfbff;
      }

      .figma-profile-settings-row:focus-visible {
        outline: 3px solid rgba(69, 61, 238, 0.16);
        outline-offset: 2px;
      }

      .figma-profile-settings-row.is-danger {
        border-color: #fee2e2;
        color: #b91c1c;
      }

      .figma-profile-settings-row.is-danger:hover {
        border-color: #fecaca;
        background: #fff7f7;
      }

      @media (hover: hover) and (pointer: fine) {
        .figma-profile-settings-row:hover {
          box-shadow: 0 8px 18px rgba(24,24,27,0.06);
          transform: translateY(-1px);
        }
      }

      .figma-profile-settings-row:active {
        transform: scale(0.96);
      }

      .figma-profile-settings-row-icon {
        display: grid;
        width: 36px;
        height: 36px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 11px;
        background: #f4f4ff;
        color: #453dee;
      }

      .figma-profile-settings-row.is-danger .figma-profile-settings-row-icon {
        background: #fff1f2;
        color: #b91c1c;
      }

      .figma-profile-settings-row-copy {
        display: grid;
        min-width: 0;
        flex: 1 1 auto;
        gap: 3px;
      }

      .figma-profile-settings-row-copy strong,
      .figma-profile-settings-row-copy small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .figma-profile-settings-row-copy strong {
        color: #3f3f46;
        font-size: 13px;
        font-weight: 950;
        line-height: 1.2;
      }

      .figma-profile-settings-row.is-danger .figma-profile-settings-row-copy strong {
        color: #b91c1c;
      }

      .figma-profile-settings-row-copy small {
        color: #8b8b98;
        font-size: 12px;
        font-weight: 750;
        line-height: 1.3;
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .figma-profile-edit-trigger,
        .figma-profile-icon-button,
        .figma-profile-media-button,
        .figma-profile-view-nav button,
        .figma-profile-badge,
        .figma-profile-award,
        .figma-profile-collection-row,
        .figma-profile-settings-head button,
        .figma-profile-settings-row {
          transition-property: none;
        }

        .figma-profile-spin {
          animation: none;
        }

        .figma-profile-edit-trigger:hover,
        .figma-profile-edit-trigger:focus-visible,
        .figma-profile-edit-trigger:active,
        .figma-profile-icon-button:hover,
        .figma-profile-icon-button:focus-visible,
        .figma-profile-icon-button:active,
        .figma-profile-media-button:hover,
        .figma-profile-media-button:focus-visible,
        .figma-profile-media-button:active,
        .figma-profile-view-nav button:hover,
        .figma-profile-view-nav button:focus-visible,
        .figma-profile-view-nav button:active,
        .figma-profile-badge:hover,
        .figma-profile-award:hover,
        .figma-profile-collection-row:hover,
        .figma-profile-collection-row:focus-visible,
        .figma-profile-collection-row:active,
        .figma-profile-settings-head button:hover,
        .figma-profile-settings-head button:focus-visible,
        .figma-profile-settings-head button:active,
        .figma-profile-settings-row:hover,
        .figma-profile-settings-row:focus-visible,
        .figma-profile-settings-row:active {
          transform: none;
        }
      }

      @media (max-width: 520px) {
        .figma-profile-awards-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .figma-profile-awards-list {
          grid-template-columns: 1fr;
        }

        .figma-profile-awards.is-collection .figma-profile-awards-list,
        .figma-profile-settings-grid {
          grid-template-columns: 1fr;
        }

        .figma-profile-collection,
        .figma-profile-settings {
          width: 100%;
        }

        .figma-profile-collection-head,
        .figma-profile-settings-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .figma-profile-settings-section-head {
          align-items: flex-start;
          flex-direction: column;
          gap: 4px;
        }

        .figma-profile-settings-section-head small {
          text-align: left;
        }

        .figma-profile-settings-head button {
          width: 100%;
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
      <span className={`figma-profile-stat-icon ${profileToneTextClass(tone)}`}>
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
      <strong className={profileToneTextClass(subject.tone)}>{subject.score}</strong>
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
        <span className={tab === 'followers' ? 'translate-x-0' : 'translate-x-full'} />
      </div>
      <div className="figma-profile-follow-list">
        {visible.map((entry, index) => (
          <Link href="/classement" className="figma-profile-follow-row" key={`${entry.user_id}-${entry.rank}-${index}`}>
            <Image src={entry.avatar_url || followerAvatar(index)} alt="" width={40} height={40} unoptimized referrerPolicy="no-referrer" className="kresco-media-outline" />
            <span>
              <strong>{entry.full_name}</strong>
              <small>{entry.total_xp.toLocaleString()} point</small>
            </span>
            <ChevronRight size={15} strokeWidth={2.4} />
          </Link>
        ))}
      </div>
    </section>
  )
}

