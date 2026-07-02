import { getJson, patchJson, postJson } from './apiClient'

export type ProfileUser = {
  id: number
  email: string
  full_name: string
  avatar_url: string
  banner_url?: string
  role: string
  is_staff: boolean
  is_pro: boolean
  niveau: string
  filiere: string
  is_email_verified: boolean
  phone_number?: string | null
  is_phone_verified?: boolean
  phone_verified_at?: string | null
  created_at: string
}

export type ProfileUpdateInput = Partial<Pick<ProfileUser, 'full_name' | 'avatar_url' | 'banner_url' | 'niveau' | 'filiere'>>

export class ProfileFeatureUnavailableError extends Error {
  constructor(message = 'This profile feature is not available from the API yet.') {
    super(message)
    this.name = 'ProfileFeatureUnavailableError'
  }
}

export async function getMyProfile() {
  return getJson<ProfileUser>('/profile/me')
}

export async function updateMyProfile(input: ProfileUpdateInput) {
  return patchJson<ProfileUser>('/profile/me', input)
}

export async function uploadProfileMedia(kind: 'avatar' | 'banner', file: File) {
  const form = new FormData()
  form.append('file', file)

  try {
    const data = await postJson<{ avatar_url?: string; banner_url?: string; url?: string }>(`/profile/me/media/${kind}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    const mediaUrl = data.url || data.avatar_url || data.banner_url
    if (!mediaUrl) throw new Error('Upload succeeded but did not return an image URL.')
    return mediaUrl
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status && [404, 405, 501].includes(status)) {
      throw new ProfileFeatureUnavailableError(`${kind === 'avatar' ? 'Avatar' : 'Banner'} upload is not available yet. Paste an image URL instead.`)
    }
    throw error
  }
}

export async function uploadProfileAvatar(file: File) {
  return uploadProfileMedia('avatar', file)
}
