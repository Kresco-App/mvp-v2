'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { apiDataErrorMessage } from '@/lib/apiData'
import { useProfileData } from '@/lib/profileData'
import { updateMyProfile, uploadProfileMedia, type ProfileUpdateInput } from '@/lib/profile'
import { useAuthStore } from '@/lib/store'
import {
  FigmaProfile,
  type FigmaProfileEditDraft,
  type FigmaProfileMediaKind,
} from '@/components/figma'
import { FigmaProfileSkeleton } from '@/components/figma/skeletons'

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const {
    profile,
    xp,
    stats,
    profileSubjects,
    notes,
    saves,
    sidebar,
    loading,
    error,
    isValidating,
    retry,
    mutateProfile,
  } = useProfileData()
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const lastToastErrorRef = useRef('')
  const uploadedMediaUrlsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!profile) return
    updateUser(profile)
  }, [profile, updateUser])

  useEffect(() => {
    if (!error) {
      lastToastErrorRef.current = ''
      return
    }
    const message = apiDataErrorMessage(error, 'Could not refresh profile data.')
    if (message === lastToastErrorRef.current) return
    lastToastErrorRef.current = message
    toast.error(message)
  }, [error])

  async function retryProfileData() {
    try {
      await retry()
    } catch {
      // SWR owns the latest error state; the effect above owns user-visible reporting.
    }
  }

  async function handleSaveProfile(draft: FigmaProfileEditDraft) {
    setSaving(true)
    setEditError(null)

    try {
      const currentProfile = profile ?? user
      const nextAvatarUrl = draft.avatar_url?.trim() ?? ''
      const nextBannerUrl = draft.banner_url?.trim() ?? ''
      const payload: ProfileUpdateInput = {
        full_name: draft.full_name.trim(),
        niveau: draft.level?.trim() ?? '',
        filiere: draft.track?.trim() ?? '',
      }
      if (nextAvatarUrl !== (currentProfile?.avatar_url?.trim() ?? '') && !uploadedMediaUrlsRef.current.has(nextAvatarUrl)) {
        payload.avatar_url = nextAvatarUrl
      }
      if (nextBannerUrl !== (currentProfile?.banner_url?.trim() ?? '') && !uploadedMediaUrlsRef.current.has(nextBannerUrl)) {
        payload.banner_url = nextBannerUrl
      }
      const savedProfile = await updateMyProfile(payload)
      await mutateProfile(savedProfile, { revalidate: false })
      updateUser(savedProfile)
      uploadedMediaUrlsRef.current.clear()
      toast.success('Profile saved.')
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save profile.')
      setEditError(message)
      toast.error(message)
      throw new Error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSelectMedia(kind: FigmaProfileMediaKind) {
    setEditError(null)

    try {
      const file = await pickImageFile()
      if (!file) return undefined
      const mediaUrl = await uploadProfileMedia(kind, file)
      uploadedMediaUrlsRef.current.add(mediaUrl)
      const field = kind === 'avatar' ? 'avatar_url' : 'banner_url'
      await mutateProfile((current) => (current ? { ...current, [field]: mediaUrl } : current), { revalidate: false })
      if (user) updateUser({ [field]: mediaUrl })
      toast.success(`${kind === 'avatar' ? 'Avatar' : 'Banner'} uploaded.`)
      return mediaUrl
    } catch (error) {
      const message = getErrorMessage(error, 'Could not upload profile image.')
      setEditError(message)
      toast.error(message)
      throw new Error(message)
    }
  }

  if (loading) {
    return <FigmaProfileSkeleton />
  }

  return (
    <>
      {error && (
        <section role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#fde68a] bg-[#fffbeb] px-5 py-4">
          <div>
            <p className="m-0 text-[14px] font-black text-[#92400e]">Profile data could not be refreshed.</p>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#b45309]">Cached or partial profile data stays visible while you retry.</p>
          </div>
          <button
            type="button"
            onClick={() => void retryProfileData()}
            disabled={isValidating}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#92400e] px-4 text-[13px] font-black text-white disabled:opacity-60"
          >
            <RotateCcw size={15} />
            {isValidating ? 'Retrying...' : 'Retry profile data'}
          </button>
        </section>
      )}
      <FigmaProfile
        user={profile ?? user}
        xp={xp}
        stats={stats}
        subjects={profileSubjects}
        notes={notes}
        saves={saves}
        sidebar={{
          chronoUnits: sidebar.chrono_units,
          calendarDays: sidebar.calendar_days,
          liveEvents: sidebar.live_events,
          leaderboardEntries: sidebar.leaderboard_entries,
        }}
        loading={false}
        saving={saving}
        editError={editError}
        onSaveProfile={handleSaveProfile}
        onSelectMedia={handleSelectMedia}
      />
    </>
  )
}

function pickImageFile() {
  return new Promise<File | null>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.hidden = true
    input.onchange = () => {
      const file = input.files?.[0] ?? null
      input.remove()
      resolve(file)
    }
    document.body.append(input)
    input.click()
  })
}

function getErrorMessage(error: unknown, fallback: string) {
  return apiDataErrorMessage(error, fallback)
}
